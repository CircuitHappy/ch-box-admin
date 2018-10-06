var exec    = require("child_process").exec;
var fs      = require("fs");

/*****************************************************************************\
    Return a function which checks for software update and installs if available
\*****************************************************************************/
module.exports = function(cmd_options, callback) {
    var cmd;
    // Handle case where no options are passed in
    if (typeof(cmd_options) == "function" && typeof(callback) == "undefined") {
        callback    = cmd_options;
        cmd_options = "";
    }

    console.log("cmd_options: " + cmd_options);
    // make sure we have a system newer than v1.0
    if (fs.existsSync("/ch/system/current/scripts/ch-update-system.sh")) {
      cmd = 'sh /ch/system/current/scripts/ch-get-latest-software.sh'
    } else {
      // got to deal with bug in v1.07 where get-latest-software still ran from current/bin instead of the system/scripts
      cmd = 'sh /ch/current/bin/ch-get-latest-software.sh'
    }
    if (cmd_options != "") {
      cmd = cmd + " " + cmd_options;
    }
    console.log("cmd: " + cmd);
    exec(cmd, function(error, stdout, stderr) {
        // Handle errors from running "iwlist scan"
        if (error) {
            return callback(error, "")
        }

        return callback(null, "");
    });

}
