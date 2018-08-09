"use strict";

/***
 *  Define the app and inject any modules we wish to
 *  refer to.
***/
var app = angular.module("RpiWifiConfig", []);

/******************************************************************************\
Function:
    AppController

Dependencies:
    ...

Description:
    Main application controller
\******************************************************************************/
app.controller("AppController", ["PiManager", "$scope", "$location", "$timeout",

    function(PiManager, $scope, $location, $timeout) {
        // Scope variable declaration
        $scope.scan_results              = [];
        $scope.selected_cell             = null;
        $scope.scan_running              = false;
        $scope.update_running            = false;
        $scope.update_status_message     = "";
        $scope.network_passcode          = "";
        $scope.show_passcode_entry_field = false;

        // Scope filter definitions
        $scope.orderScanResults = function(cell) {
            return parseInt(cell.signal_strength);
        }

        $scope.foo = function() { console.log("foo"); }
        $scope.bar = function() { console.log("bar"); }

        // Scope function definitions
        $scope.rescan = function() {
            $scope.scan_results = [];
            $scope.selected_cell = null;
            $scope.scan_running = true;
            PiManager.rescan_wifi().then(function(response) {
                console.log(response.data);
                if (response.data.status == "SUCCESS") {
                    $scope.scan_results = response.data.scan_results;
                }
                $scope.scan_running = false;
            });
        }

        $scope.change_selection = function(cell) {
            $scope.network_passcode = "";
            $scope.selected_cell = cell;
            $scope.show_passcode_entry_field = (cell != null) ? true : false;
        }

        $scope.submit_selection = function() {
            if (!$scope.selected_cell) return;

            var wifi_info = {
                wifi_ssid:      $scope.selected_cell["ssid"],
                wifi_passcode:  $scope.network_passcode,
            };
            if (wifi_info["wifi_passcode"].length >= 8 && wifi_info["wifi_passcode"].length <= 63) {
              location.href = "reboot.html";
              PiManager.enable_wifi(wifi_info).then(function(response) {
                  console.log(response.data);
                  if (response.data.status == "SUCCESS") {
                      console.log("AP Enabled - nothing left to do...");
                      //redirect would be good here on success, but success isn't being echo'd back.
                  }
              });
            } else {
              alert("WiFi password needs to be between 8 and 63 characters in length.");
            }

        }

        $scope.get_software = function() {
          $scope.download_status_message = "Downloading update...";
          $scope.update_running = true;
          PiManager.update_software().then(function(response) {
            console.log(response.data);
            if (response.data.status == "SUCCESS") {
              $scope.update_status_message = "New software installed. Rebooting Missing Link.";
              console.log("About to reboot.");
              PiManager.reboot_box();
            } else {
              console.log("error code: " + response.data.error["code"]);
              switch (response.data.error["code"]) {
                case 1:
                  $scope.update_status_message = "No updates available.";
                  break;
                case 2:
                  $scope.update_status_message = "Error downloading update. Try again in a few minutes. Contact support if this problem persists.";
                  break;
                case 3:
                  $scope.update_status_message = "Error validating installer. Try again in a few minutes. Contact support if this problem persists.";
                  break;
                case 4:
                  $scope.update_status_message = "Error extracting installer files. Try again in a few minutes. Contact support if this problem persists.";
                  break;
                case 5:
                  $scope.update_status_message = "Error relinking files. Your system might need to be reinstalled. Please contact support to find out how to do this.";
                  break;
                default:
                  $scope.update_status_message = "Updater hit an unexpected error. Is this device connected to the Internet?";
              }
            }
            $scope.update_running = false;
          });
        }

        // Defer load the scanned results from the rpi
        $scope.rescan();
    }]
);

/*****************************************************************************\
    Service to hit the rpi wifi config server
\*****************************************************************************/
app.service("PiManager", ["$http",

    function($http) {
        return {
            rescan_wifi: function() {
                return $http.get("/api/rescan_wifi");
            },
            enable_wifi: function(wifi_info) {
                return $http.post("/api/enable_wifi", wifi_info);
            },
            update_software: function() {
                return $http.get("/api/update_software");
            },
            reboot_box: function() {
                return $http.get("/api/reboot");
            }
        };
    }]

);

/*****************************************************************************\
    Directive to show / hide / clear the password prompt
\*****************************************************************************/
app.directive("rwcPasswordEntry", function($timeout) {
    return {
        restrict: "E",

        scope: {
            visible:  "=",
            passcode: "=",
            reset:    "&",
            submit:   "&",
        },

        replace: true,          // Use provided template (as opposed to static
                                // content that the modal scope might define in the
                                // DOM)
        template: [
            "<div class='rwc-password-entry-container' ng-class='{\"hide-me\": !visible}'>",
            "    <div class='box'>",
            "         <input type = 'password' placeholder = 'Passcode...' ng-model = 'passcode' />",
            "         <div class = 'btn btn-cancel' ng-click = 'reset(null)'>Cancel</div>",
            "         <div class = 'btn btn-ok' ng-click = 'submit()'>Submit</div>",
            "    </div>",
            "</div>"
        ].join("\n"),

        // Link function to bind modal to the app
        link: function(scope, element, attributes) {
        },
    };
});
