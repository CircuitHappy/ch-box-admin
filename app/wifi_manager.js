var _             = require("underscore")._,
    async         = require("async"),
    fs            = require("fs"),
    exec          = require("child_process").exec,
    config        = require("../config.json");

// Better template format
_.templateSettings = {
    interpolate: /\{\{(.+?)\}\}/g,
    evaluate :   /\{\[([\s\S]+?)\]\}/g
};

// Helper function to write a given template to a file based on a given
// context
function write_template_to_file(template_path, file_name, context, callback) {
    async.waterfall([

        function read_template_file(next_step) {
            fs.readFile(template_path, {encoding: "utf8"}, next_step);
        },

        function update_file(file_txt, next_step) {
            var template = _.template(file_txt);
            fs.writeFile(file_name, template(context), next_step);
        }

    ], callback);
}

// Clear and then Write Wifi status to file
function write_wifi_status(status) {
  fs.truncate(config.wifi_status_path, 0, function(err) {
    if(err) {
        return console.log(err);
    }
  });
  fs.writeFile(config.wifi_status_path, status, function(err) {
    if(err) {
        return console.log(err);
    }
  });
}

/*****************************************************************************\
    Return a set of functions which we can use to manage and check our wifi
    connection information
\*****************************************************************************/
module.exports = function() {
    // Detect which wifi driver we should use, the rtl871xdrv or the nl80211
    exec("iw list", function(error, stdout, stderr) {
        if (stderr.match(/^nl80211 not found/)) {
            config.wifi_driver_type = "rtl871xdrv";
        }
    });

    // Hack: this just assumes that the outbound interface will be "wlan0"

    // Define some globals
    var ifconfig_fields = {
        "inet_addr":       /inet\s([^\s]+)/,
    },  iwconfig_fields = {
        "ap_addr":         /Access Point:\s([^\s]+)/,
        "ap_ssid":         /ESSID:\"([^\"]+)\"/,
        "unassociated":    /(unassociated)\s+Nick/,
    },  last_wifi_info = null;

    // TODO: rpi-config-ap hardcoded, should derive from a constant

    // Get generic info on an interface
    var _get_wifi_info = function(callback) {
        var output = {
            inet_addr:    "<unknown>",
            ap_addr:      "<unknown_ap>",
            ap_ssid:      "<unknown_ssid>",
            unassociated: "<unknown>",
        };

        // Inner function which runs a given command and sets a bunch
        // of fields
        function run_command_and_set_fields(cmd, fields, callback) {
            exec(cmd, function(error, stdout, stderr) {
                if (error) return callback(error);
                for (var key in fields) {
                    re = stdout.match(fields[key]);
                    if (re && re.length > 1) {
                        output[key] = re[1];
                    }
                }
                callback(null);
            });
        }

        // Run a bunch of commands and aggregate info
        async.series([
            function run_ifconfig(next_step) {
                run_command_and_set_fields("ifconfig wlan0", ifconfig_fields, next_step);
            },
            function run_iwconfig(next_step) {
                run_command_and_set_fields("iwconfig wlan0", iwconfig_fields, next_step);
            },
        ], function(error) {
            last_wifi_info = output;
            return callback(error, output);
        });
    },

    _reboot_wireless_network = function(wlan_iface, callback) {
        async.series([
            function down(next_step) {
                exec("sudo ifdown " + wlan_iface, function(error, stdout, stderr) {
                    if (!error) console.log("ifdown " + wlan_iface + " successful...");
                    next_step();
                });
            },
            function up(next_step) {
                exec("sudo ifup " + wlan_iface, function(error, stdout, stderr) {
                    if (!error) console.log("ifup " + wlan_iface + " successful...");
                    next_step();
                });
            },
        ], callback);
    },

    // Wifi related functions
    _is_wifi_enabled_sync = function(info) {
        // If we are not an AP, and we have a valid
        // inet_addr - wifi is enabled!
        if (null        == _is_ap_enabled_sync(info) &&
            "<unknown>" != info["inet_addr"]         &&
            "<unknown>" == info["unassociated"] ) {
            return info["inet_addr"];
        }
        return null;
    },

    _is_wifi_enabled = function(callback) {
        _get_wifi_info(function(error, info) {
            write_wifi_status("TRYING_TO_CONNECT");
            if (error) return callback(error, null);
            return callback(null, _is_wifi_enabled_sync(info));
        });
    },

    // Access Point related functions
    _is_ap_enabled_sync = function(info) {
        // If there is no IP address assigned, we need to start the AP
        var is_ap = info["inet_addr"] == "<unknown>";
        console.log("inet_addr is " + info["inet_addr"]);
        return (is_ap) ? info["inet_addr"].toLowerCase() : null;
    },

    _is_ap_enabled = function(callback) {
        _get_wifi_info(function(error, info) {
            if (error) return callback(error, null);
            return callback(null, _is_ap_enabled_sync(info));
        });
    },

    _is_ap_enabled_sync = function(info) {
        // If there is no IP address assigned, we need to start the AP
        var is_ap = info["inet_addr"] == "<unknown>";
        console.log("inet_addr is " + info["inet_addr"]);
        return (is_ap) ? info["inet_addr"].toLowerCase() : null;
    },

    _is_ap_enabled = function(callback) {
        _get_wifi_info(function(error, info) {
            if (error) return callback(error, null);
            return callback(null, _is_ap_enabled_sync(info));
        });
    },

    // Enables the accesspoint w/ bcast_ssid. This assumes that both
    // isc-dhcp-server and hostapd are installed using:
    // $sudo npm run-script provision
    _enable_ap_mode = function(bcast_ssid, callback) {
        _is_ap_enabled(function(error, result_addr) {
            if (error) {
                console.log("ERROR: " + error);
                return callback(error);
            }

            if (result_addr != "<unknown>" && !config.access_point.force_reconfigure) {
                console.log("\nAccess point is enabled with ADDR: " + result_addr);
                return callback(null);
            } else if (config.access_point.force_reconfigure) {
                console.log("\nForce reconfigure enabled - reset AP");
            } else {
                console.log("\nAP is not enabled yet... enabling...");
            }

            var context = config.access_point;
            context["enable_ap"] = true;
            context["wifi_driver_type"] = config.wifi_driver_type;

            // Here we need to actually follow the steps to enable the ap
            async.series([

              // Set up hostapd conf SSID
              function update_interfaces(next_step) {
                  write_template_to_file(
                      "./assets/etc/hostapd/hostapd.conf.template",
                      "/etc/hostapd/hostapd.conf",
                      context, next_step);
              },

              // create_ap is already running, but we need to stop wpa_supplicant
              function create_uap0_interface(next_step) {
                  exec("iw dev wlan0 interface add uap0 type __ap", function(error, stdout, stderr) {
                      console.log(stdout);
                      if (!error) console.log("... uap0 interface created!");
                      next_step();
                  });
              },

              function create_nat_routing(next_step) {
                  exec("iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE", function(error, stdout, stderr) {
                      console.log(stdout);
                      if (!error) console.log("... NAT routing created!");
                      next_step();
                  });
              },

              function start_uap0_link(next_step) {
                  exec("ip link set uap0 up", function(error, stdout, stderr) {
                      console.log(stdout);
                      if (!error) console.log("... uap0 link up");
                      next_step();
                  });
              },

              function set_uap0_ip_address_range(next_step) {
                  exec("ip addr add 192.168.4.1/24 broadcast 192.168.4.255 dev uap0", function(error, stdout, stderr) {
                      console.log(stdout);
                      if (!error) console.log("... uap0 IP address range set");
                      next_step();
                  });
              },

              function start_hostapd_service(next_step) {
                  exec("service hostapd start", function(error, stdout, stderr) {
                      console.log(stdout);
                      if (!error) console.log("... hostapd started");
                      next_step();
                  });
              },

              function start_dnsmasq_service(next_step) {
                  exec("service dnsmasq start", function(error, stdout, stderr) {
                      console.log(stdout);
                      if (!error) console.log("... dnsmasq started");
                      next_step();
                  });
              },

              function write_ap_mode_wifi_status(next_step) {
                write_wifi_status("AP_MODE");
                next_step();
              },

            ], callback);
        });
    },

    // Disables AP mode and reverts to wifi connection
    _enable_wifi_mode = function(connection_info, callback) {

        console.log("received connection_info: \"" + connection_info.wifi_ssid + "\" \"" + connection_info.wifi_passcode + "\"");
        _is_wifi_enabled(function(error, result_ip) {
            if (error) return callback(error);

            if (result_ip) {
                console.log("\nWifi connection is enabled with IP: " + result_ip);
            }

            async.series([

              // Stop create_ap...
              // function stop_ap_service(next_step) {
              //     exec("service create_ap stop", function(error, stdout, stderr) {
              //         console.log(stdout);
              //         if (!error) console.log("... create_ap stopped!");
              //         next_step();
              //     });
              // },

                // Add SSID to wpa_supplicant...
                function update_interfaces(next_step) {
                    exec("wpa_passphrase \"" + connection_info.wifi_ssid + "\" \"" + connection_info.wifi_passcode + "\" >> /etc/wpa_supplicant/wpa_supplicant.conf", function(error, stdout, stderr) {
                        console.log(stdout);
                        if (!error) console.log("... saved to wpa_supplicant");
                        next_step();
                    });
                },

                // reboot the machine...
                function reboot(next_step) {
                    console.log("about to reboot.");
                    exec("shutdown -r now", function(error, stdout, stderr) {
                        console.log(stdout);
                        if (!error) console.log("... rebooting");
                        next_step();
                    });
                },

                // // Get IP from dhclient...
                // function update_dhcp(next_step) {
                //     console.log("about to refresh IP with dhclient.");
                //     exec("dhclient wlan0", function(error, stdout, stderr) {
                //         console.log(stdout);
                //         if (!error) console.log("... dhclient acquired IP address");
                //         next_step();
                //     });
                // },

                // function reboot_network_interfaces(next_step) {
                //     _reboot_wireless_network(config.wifi_interface, next_step);
                // },

            ], callback);
        });

    };

    return {
        get_wifi_info:           _get_wifi_info,
        reboot_wireless_network: _reboot_wireless_network,

        is_wifi_enabled:         _is_wifi_enabled,
        is_wifi_enabled_sync:    _is_wifi_enabled_sync,

        is_ap_enabled:           _is_ap_enabled,
        is_ap_enabled_sync:      _is_ap_enabled_sync,

        enable_ap_mode:          _enable_ap_mode,
        enable_wifi_mode:        _enable_wifi_mode,
    };
}
