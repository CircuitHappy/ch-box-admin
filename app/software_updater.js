var exec    = require("child_process").exec;

/*****************************************************************************\
    Return a function which checks for software update and installs if available
\*****************************************************************************/
module.exports = function(cmd_options, callback) {
    // Handle case where no options are passed in
    if (typeof(cmd_options) == "function" && typeof(callback) == "undefined") {
        callback    = cmd_options;
        cmd_options = "";
    }

    console.log("cmd_options: " + cmd_options);
    var cmd = 'sh /ch/system/current/scripts/ch-get-latest-software.sh';
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
