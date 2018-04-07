# raspberry-wifi-conf

## Heavily altered version for Missing Link

A Node application which makes connecting your RaspberryPi to your home wifi easier

***

### Set up your system* (this will have to be turned in to an automated setup script)*

*Based on** SurferTim’s steps here: **[https://www.raspberrypi.org/forums/viewtopic.php?t=19626*3](https://www.raspberrypi.org/forums/viewtopic.php?t=196263)

### Configure Services

#### Disable (or uninstall) dhcpcd service

`sudo systemctl disable dhcpcd`

#### Install, then disable dnsmasq and hostapd

_The node script will start these services when needed

`sudo apt-get install dnsmasq hostapd`

`sudo systemctl disable dnsmasq`

`sudo systemctl disable hostapd`


#### dnsmasq.conf

`sudo vi /etc/dnsmasq.conf`

Add this to the top of the file:

```
interface=uap0

dhcp-range=192.168.4.20,192.168.4.100,255.255.255.0,12h
```


#### hostapd

`sudo vi /etc/default/hostapd`

uncomment this

`DAEMON_CONF="/etc/hostapd/hostapd.conf"`


#### sysctl.conf

`sudo vi /etc/sysctl.conf`

uncomment this

`net.ipv4.ip_forward=1`

#### Network Interfaces

`sudo vi /etc/network/interfaces`

looks like this:

```
auto lo

iface lo inet loopback

allow-hotplug wlan0

auto wlan0

iface wlan0 inet dhcp

wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf
```

#### Reduce network timeout

`sudo vi /etc/systemd/system/network-online.target.wants/networking.service`

Find TimeoutStartSec and set to 10sec:

`TimeoutStartSec=10sec`


### Install Software for NodeJS Server

`sudo apt-get install git nodejs npm`

`sudo npm install underscore async express angular font-awesome`

`sudo npm install bower -g`

### Make a symlink from nodejs to node

`sudo ln -s /usr/bin/nodejs /usr/bin/node`

### Install NodeJS Server

1. Install "rpi-zero" branch of [raspberry-wifi-conf](https://github.com/CircuitHappy/raspberry-wifi-conf)

2. Follow these instructions:

`git clone https://github.com/sabhiram/raspberry-wifi-conf.git`

`cd raspberry-wifi-conf`

`npm update`

`bower install`

`sudo npm run-script provision`

`sudo cp assets/init.d/raspberry-wifi-conf /etc/init.d/raspberry-wifi-conf`

`sudo chmod +x /etc/init.d/raspberry-wifi-conf`

`sudo update-rc.d raspberry-wifi-conf defaults`

3. Reboot and Bob’s your uncle

### TO DO:

* Init script to do the following:

    * Do all the above configuring

    * Set /etc/hosts hostname to MissingLink-xyza (where xyza is based on MAC)

    * Set config.json Access Point SSID to same as hostname
