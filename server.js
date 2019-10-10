var async               = require("async"),
    wifi_manager        = require("./app/wifi_manager")(),
    fs                  = require("fs"),
    child               = require("child_process"),
    exec                = require("child_process").exec,
    config              = undefined,
    box_info            = {};

/*****************************************************************************\
    1. load box info
    2. Get our AP Mode setting
    3. auto: check if we have wifi IP address, if we don't go in to AP Mode
       on: immediately go in to AP Mode
       off: check if we have wifi IP address, if we don't, do do anything
    4. Start the HTTP server for backend administration.
\*****************************************************************************/
async.series([

    // load info stored in text files about installed software, system, beta
    function load_config(next_step) {
      wifi_manager.load_config(function(err, conf) {
        config = conf;
        next_step();
      });
    },

    // load info stored in text files about installed software, system, beta
    function load_box_info(next_step) {
      wifi_manager.write_wifi_status("TRYING_TO_CONNECT");
      wifi_manager.get_box_info(function(err, info) {
        box_info = info;
        next_step();
      });
    },

    function load_ap_mode(next_step) {
      //console.log("Checking AP Mode: " + box_info.ap_mode);
      switch (box_info.ap_mode) {
        case "auto" :
          //console.log("AUTO case...");
          wifi_manager.write_wifi_status("TRYING_TO_CONNECT");
          wifi_manager.is_wifi_enabled(function(error, result_ip) {
              if (result_ip) {
                  console.log("\nWifi is enabled, and IP " + result_ip + " assigned");
                  wifi_manager.write_wifi_status("WIFI_CONNECTED");
              } else {
                  console.log("\nWifi is not enabled, Enabling AP for self-configure");
                  wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {
                      if(error) {
                          console.log("... AP Enable ERROR: " + error);
                      } else {
                          console.log("... AP Enable Success!");
                          wifi_manager.write_wifi_status("AP_MODE");
                      }
                  });
              }
              next_step();
          });
          break;

        case "on" :
          //console.log("ON case...");
          wifi_manager.write_wifi_status("TRYING_TO_CONNECT");
          wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {
              if(error) {
                  console.log("... AP Enable ERROR: " + error);
              } else {
                  console.log("... AP Enable Success!");
                  wifi_manager.write_wifi_status("AP_MODE");
              }
              next_step();
          });
          break;

        case "off" :
          //console.log("OFF case...");
          wifi_manager.write_wifi_status("TRYING_TO_CONNECT");
          wifi_manager.is_wifi_enabled(function(error, result_ip) {
              if (result_ip) {
                  console.log("\nWifi is enabled, and IP " + result_ip + " assigned");
                  wifi_manager.write_wifi_status("WIFI_CONNECTED");
              } else {
                  console.log("\nNo WiFi network found, AP Mode is OFF.");
                  wifi_manager.write_wifi_status("NO_WIFI_FOUND");
              }
              next_step();
          });
          break;

        default :
          //console.log("default case...");
          wifi_manager.write_wifi_status("TRYING_TO_CONNECT");
          wifi_manager.is_wifi_enabled(function(error, result_ip) {
              if (result_ip) {
                  console.log("\nWifi is enabled, and IP " + result_ip + " assigned");
                  wifi_manager.write_wifi_status("WIFI_CONNECTED");
              } else {
                  console.log("\nWifi is not enabled, Enabling AP for self-configure");
                  wifi_manager.enable_ap_mode(config.access_point.ssid, function(error) {
                      if(error) {
                          console.log("... AP Enable ERROR: " + error);
                      } else {
                          console.log("... AP Enable Success!");
                          wifi_manager.write_wifi_status("AP_MODE");
                      }
                  });
              }
              next_step();
          });
          break;
      }

    },

    // Host HTTP server for web backend, the "api.js"
    function start_http_server(next_step) {
      console.log("HTTP server running...");
      serverProc = child.fork("/ch/current/www/ch-box-admin/app/api.js");
      require("/ch/current/www/ch-box-admin/app/api.js")(wifi_manager, next_step);
    },

], function(error) {
    if (error) {
        console.log("ERROR: " + error);
    }
});

function sleep(time, callback) {
    var stop = new Date().getTime();
    while(new Date().getTime() < stop + time) {
        ;
    }
    callback();
}
