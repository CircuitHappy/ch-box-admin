var _             = require("underscore")._,
    async         = require("async"),
    fs            = require("fs"),
    exec          = require("child_process").exec,
    config_path   = '/ch/config.json';
    config        = null,
    box_info      = {
      software_version:   "unknown",
      system_version:     "unknown",
      beta_code:          "",
      ap_mode:            "not_set"
    };

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

    // Write WiFi Conf status to files
    _write_wifi_status = function(status) {
      //clear wifi status file
      fs.truncate(config.wifi_status_path, 0, function(err) {
        if(err) {
          return console.log(err);
        }
      });
      //then write the new status to file
      fs.writeFile(config.wifi_status_path, status, function(err) {
        if(err) {
          return console.log(err);
        }
      });
    },

    // Read the mode set in ap_mode file
    _read_ap_mode = function(callback) {
      ap_mode = "auto";
      if (fs.existsSync(config.ap_mode_path, 'utf8')) {
        fs.readFile(config.ap_mode_path, (err, data) => {
          if (!err) {
            ap_mode = data.toString().replace(/\r?\n|\r/g, "");
          }
          return callback(null, ap_mode);
        });
      } else {
        return callback(null, ap_mode);
      }
    },

    _get_box_info = function(callback) {
        //call is from api.js, return box_info immediately
        if (callback == undefined) {return box_info;}
        _load_box_info(function() {
            return callback(null, box_info);
        });
    },

    _get_ssid_settings = function(callback) {
      var ssid_settings = config.access_point;
      //console.log("get_ssid_settings: " + JSON.stringify(ssid_settings));
      return callback(null, ssid_settings);
    },

    _load_config = function(callback) {
      async.series([

        function load_path(next_step) {
          if (fs.existsSync(config_path, 'utf8') == false) {
              exec("cp /ch/current/www/ch-box-admin/config.json " + config_path, function(error, stdout, stderr) {
                  //console.log(stdout);
                  console.log("... config.json not found, copying default file.");
                  next_step();
              });
          } else {
            next_step();
          }
        },

        function load_conf(next_step) {
          fs.readFile(config_path, 'utf8', function (err, data) {
            if (err) console.log("load config error: " + err);
            config = JSON.parse(data);
            next_step();
          });
        },

        function check_ssid_default(next_step) {
          if (config.access_point.ssid == "") {
            console.log("Reset SSID to defaults.");
            _reset_ssid_defaults(function(){
              next_step();
            });
          }
          next_step();
        },

        function return_config(next_step) {
          //console.log("server load config: " + JSON.stringify(config));
          return callback(null, config);
          next_step();
        }

      ], callback);

    },

    _update_ssid_config = function(ssid_settings, callback) {
      config.access_point.ssid = ssid_settings.ssid;
      config.access_point.hidden_ssid = ssid_settings.hidden_ssid | 0;
      config.access_point.passphrase = ssid_settings.ssid_passphrase;
      _update_config_file(function(err){
        return callback(err);
      });
    },

    _reset_ssid_defaults = function(callback) {
      console.log("about to reset ssid settings.");
      async.series([

        function apply_hostname_to_ssid(next_step) {
          exec("hostname", function(error, stdout, stderr) {
              console.log(stdout);
              if (!error && stdout != null) {
                config.access_point.ssid = stdout.replace(/\r?\n|\r/g, "");
              }
              console.log("... SSID is " + config.access_point.ssid);
              next_step();
          });
        },

        function apply_ssid_defaults(next_step) {
          config.access_point.hidden_ssid = 0;
          config.access_point.passphrase = "link1234";
          next_step();
        },

        function save_settings(next_step) {
          console.log("saving config.");
          _update_config_file(function(){
            _reboot();
            next_step();
          });
        },

      ], callback);
    },

    // Save config to disk
    _update_config_file = function(callback) {
      fs.writeFile(config_path, JSON.stringify(config), function (err) {
        if (err) {
          return console.log(err);
        } else {
          return callback();
        }
      })
    },

    // copy /ch/version.txt to .app/views for easier reading of the version file.
    _load_box_info = function(callback) {

          async.series([

              function get_software_version(next_step) {
                if (fs.existsSync('/ch/version.txt', 'utf8')) {
                  fs.readFile('/ch/version.txt', (err, data) => {
                    if (err) throw err;
                      box_info.software_version = data.toString().replace(/\r?\n|\r/g, "");
                      console.log("software_version: " + box_info.software_version);
                      next_step();
                  });
                }
              },

              function get_system_version(next_step) {
                if (fs.existsSync('/ch/system-version.txt', 'utf8')) {
                  fs.readFile('/ch/system-version.txt', (err, data) => {
                    if (err) throw err;
                      box_info.system_version = data.toString().replace(/\r?\n|\r/g, "");
                      console.log("system_version: " + box_info.system_version);
                      next_step();
                  });
                }
              },

              function get_beta_code(next_step) {
                if (fs.existsSync('/ch/beta_code.txt', 'utf8')) {
                  fs.readFile('/ch/beta_code.txt', (err, data) => {
                    if (err) throw err;
                      box_info.beta_code = data.toString().replace(/\r?\n|\r/g, "");
                      console.log("beta_code: " + box_info.beta_code);
                      next_step();
                  });
                }
              },

              function get_ap_mode(next_step) {
                _read_ap_mode(function(err, mode) {
                  box_info.ap_mode = mode;
                  //console.log("get_ap_mode: " + box_info.ap_mode);
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

          if (result_addr != "<unknown>" && box_info.ap_mode != "on") {
              console.log("\nAccess point is enabled with ADDR: " + result_addr);
              return callback(null);
          } else {
              console.log("\nAP is not enabled yet... enabling...");
          }

          var context = config.access_point;
          context["enable_ap"] = true;
          context["wifi_driver_type"] = config.wifi_driver_type;

          // Here we need to actually follow the steps to enable the ap
          async.series([

            function disable_wpa_supplicant(next_step) {
              exec("systemctl stop wpa_supplicant && killall wpa_supplicant", function(error, stdout, stderr) {
                  //console.log(stdout);
                  if (!error) {
                    console.log("... wpa_supplicant is shutdown");
                  }
                  next_step();
              });
            },

            // Set up hostapd conf SSID
            function update_interfaces(next_step) {
                write_template_to_file(
                    "/ch/current/www/ch-box-admin/assets/etc/hostapd/hostapd.conf.template",
                    "/etc/hostapd/hostapd.conf",
                    context, next_step);
            },

            function create_uap0_interface(next_step) {
                exec("iw dev wlan0 interface add uap0 type __ap", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... uap0 interface created!");
                    next_step();
                });
            },

            function create_nat_routing(next_step) {
                exec("iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... NAT routing created!");
                    next_step();
                });
            },

            function start_uap0_link(next_step) {
                exec("ip link set uap0 up", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... uap0 link up");
                    next_step();
                });
            },

            function set_uap0_ip_address_range(next_step) {
                exec("ip addr add 192.168.4.1/24 broadcast 192.168.4.255 dev uap0", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... uap0 IP address range set");
                    next_step();
                });
            },

            function start_hostapd_service(next_step) {
                exec("service hostapd start", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... hostapd started");
                    next_step();
                });
            },

            function start_dnsmasq_service(next_step) {
                exec("service dnsmasq start", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... dnsmasq started");
                    next_step();
                });
            },

          ], callback);
      });
    },

    // Disables AP mode and reverts to wifi connection
    _disable_ap_mode = function(callback) {
        async.series([
            // Take down AP services
            function stop_hostapd_service(next_step) {
                exec("service hostapd stop", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... hostapd stopped");
                    next_step();
                });
            },

            function stop_dnsmasq_service(next_step) {
                exec("service dnsmasq stop", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... dnsmasq stopped");
                    next_step();
                });
            },

            function restart_network_service(next_step) {
                exec("systemctl restart networking", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... network reset");
                    next_step();
                });
            },

            function restart_dhcp_service(next_step) {
                exec("systemctl restart dhcp", function(error, stdout, stderr) {
                    //console.log(stdout);
                    if (!error) console.log("... network reset");
                    next_step();
                });
            },

        ], callback);
    },

    // Save connection_info to wpa_supplicant
    _store_wifi_creds = function(connection_info, callback) {
        console.log("received connection_info: \"" + connection_info.wifi_ssid + "\" \"" + connection_info.wifi_passcode + "\"");
        async.series([
          function update_interfaces(next_step) {
              exec("wpa_passphrase \"" + connection_info.wifi_ssid + "\" \"" + connection_info.wifi_passcode + "\" >> /etc/wpa_supplicant/wpa_supplicant.conf", function(error, stdout, stderr) {
                  if (!error) console.log("... saved to wpa_supplicant");
                  next_step();
              });
          }
        ]);
    },

    // Save connection_info to wpa_supplicant
    _start_missinglink = function(callback) {
        async.series([
          function update_interfaces(next_step) {
              exec("systemctl start missing-link", function(error, stdout, stderr) {
                  if (!error) console.log("... restarted missing-link.service");
                  next_step();
              });
          }
        ]);
    },

    // Reboots the box
    _reboot = function(callback) {

          async.series([
              function write_boot_status_and_wait_to_reboot(next_step) {
                  _write_wifi_status("REBOOT");
                  exec("sync;sync;sync;sleep 1;shutdown -r now", function(error, stdout, stderr) {
                      if (!error) console.log("... rebooting");
                  });
                  next_step();
              },

          ], callback);
    }

    return {
        get_wifi_info:           _get_wifi_info,

        is_wifi_enabled:         _is_wifi_enabled,
        is_wifi_enabled_sync:    _is_wifi_enabled_sync,

        is_ap_enabled:           _is_ap_enabled,
        is_ap_enabled_sync:      _is_ap_enabled_sync,

        enable_ap_mode:          _enable_ap_mode,
        disable_ap_mode:         _disable_ap_mode,
        store_wifi_creds:        _store_wifi_creds,

        write_wifi_status:       _write_wifi_status,

        read_ap_mode:            _read_ap_mode,

        reboot:                  _reboot,

        get_box_info:            _get_box_info,

        load_config:             _load_config,

        get_ssid_settings:       _get_ssid_settings,

        update_ssid_config:      _update_ssid_config,
        reset_ssid_defaults:     _reset_ssid_defaults,

        start_missinglink:       _start_missinglink,

    };
}
