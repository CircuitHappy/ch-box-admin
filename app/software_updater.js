var _             = require("underscore")._,
    async         = require("async"),
    fs            = require("fs"),
    exec          = require("child_process").exec,
    config        = require("../config.json");

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
        // Disables AP mode and reverts to wifi connection
        _update_software = function(connection_info, callback) {

            console.log("received connection_info: \"" + connection_info.wifi_ssid + "\" \"" + connection_info.wifi_passcode + "\"");
            _is_software_uptodate(function(error, result_ip) {
                if (error) return callback(error);

                async.series([
                    // Add SSID to wpa_supplicant...
                    function update_interfaces(next_step) {
                        exec("sh /ch/current/bin/get_latest_software.sh", function(error, stdout, stderr) {
                            console.log(stdout);
                            if (!error) console.log("... software update finished");
                            next_step();
                        });
                    },

                    //don't want to reboot if not needed
                    function write_boot_status_and_wait(next_step) {
                        _write_wifi_status("REBOOT");
                        setTimeout( function () {
                          console.log("about to reboot.");
                        }, 2000);
                        next_step();
                    },

                    // reboot the machine...
                    // function reboot(next_step) {
                    //     exec("shutdown -r now", function(error, stdout, stderr) {
                    //         console.log(stdout);
                    //         if (!error) console.log("... rebooting");
                    //         next_step();
                    //     });
                    // },

                ], callback);
            });

        };

        return {
            update_software:           _update_software,
        };
    }
