var exec    = require("child_process").exec,
    async   = require("async");

/*****************************************************************************\
    Return a function which lists logs to web page
\*****************************************************************************/
module.exports = function(cmd_options, callback) {
    // Handle case where no options are passed in
    if (typeof(cmd_options) == "function" && typeof(callback) == "undefined") {
        callback    = cmd_options;
        cmd_options = "";
    }
    var output    = [],
        log_scan  = {scan_results:["logs"]},
        nextline  = "";

    // Run a bunch of commands and aggregate info
    async.series([

      function missing_link_status(next_step) {
        exec('journalctl -u missing-link.service -n 50', function(error, stdout, stderr) {
            if (error) {
                return callback(error, output)
            }

            log_scan["missing_link"] = [];
            var lines = stdout.split("\n");
            for (var idx in lines) {
                log_scan["missing_link"].push(lines[idx].trim());
            }
            next_step();
        });
      },

      function ch_box_admin_status(next_step) {
        exec('journalctl -u ch-box-admin.service -n 50', function(error, stdout, stderr) {
            if (error) {
                return callback(error, output)
            }

            log_scan["ch_box_admin"] = [];
            var lines = stdout.split("\n");
            for (var idx in lines) {
                log_scan["ch_box_admin"].push(lines[idx].trim());
            }
            next_step();
        });
      },

      function syslog(next_step) {
        exec('tail -50 /var/log/syslog', function(error, stdout, stderr) {
            if (error) {
                return callback(error, output)
            }

            log_scan["syslog"] = [];
            var lines = stdout.split("\n");
            for (var idx in lines) {
              log_scan["syslog"].push(lines[idx].trim());

            }
            next_step();
        });
      },

      function return_logs(next_step) {
        output.push(log_scan);
        return callback(null, output);
      },

    ], callback);
}
