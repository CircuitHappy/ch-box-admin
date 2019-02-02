var exec    = require("child_process").exec,
    async   = require("async");

/*****************************************************************************\
    Return a function which is responsible for using "wpa_cli list_networks"
    to list stored WiFi network credentials in WPA Supplicant
\*****************************************************************************/
module.exports = function() {

  _list_stored_wifi = function(cmd_options, callback) {
    // Handle case where no options are passed in
    if (typeof(cmd_options) == "function" && typeof(callback) == "undefined") {
        callback    = cmd_options;
        cmd_options = "";
    }

    exec("wpa_cli list_networks && iwgetid", function(error, stdout, stderr) {
        // Handle errors from running "iwlist scan"
        if (error) {
            return callback(error, output)
        }

        /* The output structure looks like this:
        [
            { ssid: "WifiB", network_id: 0 },
            { ssid: "WifiA", network_id: 1 },
            ...
        ] */
        var output          = {scan_results:[]},
            current_network = null,
            connected_ssid = null;

        function append_network() {
            if (current_network != null) {
                if (typeof(current_network["ssid"]) != "undefined" &&
                    current_network["ssid"] != "" ) {
                    output["scan_results"].push(current_network);
                }
                current_network = null;
            }
        }

        function get_current_ssid(text) {
          var match_text = text.match(/ESSID:\"(.*)\"/)[1];
          if (match_text) {
            return match_text;
          }
          return null;
        }

        // What SSID are we connected to?
        connected_ssid = get_current_ssid(stdout);
        console.log("current ssid: " + connected_ssid);
        // Parse the result, build return object
        lines = stdout.split("\n");
        for (var idx in lines) {
            line = lines[idx].trim();
            // Detect network rows (start with a number)
            if (line.match(/[0-9]+/)) {
            } else {
              continue;
            }

            // Detect new cell
            var re_new_network = line.split("\t");
            if (re_new_network) {
                current_network = {
                    "network_id": parseInt(re_new_network[0]),
                    "ssid": re_new_network[1],
                    "connected": (re_new_network[1] == connected_ssid),
                };
                append_network();
                continue;
            }
        }
        return callback(null, output);
    });
  },

  _remove_network = function (network_id, callback) {
    var cmd;
    console.log("network_id: " + network_id);
    if (isNaN(network_id)) {
      console.log("Network ID is Not a Number");
      return callback(null, "Network ID is Not a Number!");
    }

    cmd = "wpa_cli remove_network " + network_id;
    console.log("cmd: " + cmd);
    exec(cmd, function(error, stdout, stderr) {
        if (error) {
          console.log("There was an error removing network: " + stderr);
          return callback(error, "");
        }
        console.log("removed network? " + stdout);
        return callback(null, "");
    });
  },

  _update_stored_networks = function (callback) {
    exec("wpa_cli save_config", function(error, stdout, stderr) {
      if (error) {
        return callback(error, "");
      }
      return callback(null, "");
    });
  };

  return {
      list_networks:              _list_stored_wifi,
      remove_network:             _remove_network,
      update_stored_networks:     _update_stored_networks
  };
}
