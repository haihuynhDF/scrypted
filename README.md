# Scrypted Home Automation

Scrypted is a home automation platform primarily focusing on making camera experiences seamless.
 * Streams load instantly, everywhere: [Demo](https://www.reddit.com/r/homebridge/comments/r34k6b/if_youre_using_homebridge_for_cameras_ditch_it/)
 * HomeKit Secure Video Support
 * Google Home support: "Ok Google, Stream Backyard"

<img width="400" alt="Scrypted_Management_Console" src="https://user-images.githubusercontent.com/73924/131903488-722d87ac-a0b0-40fe-b605-326e6b886e35.png">

## Discord

[Join Scrypted Discord](https://discord.gg/DcFzmBHYGq)

## Supported Platforms

 * Google Home
 * Apple HomeKit
 * Amazon Alexa

Supported accessories: 
 * https://github.com/koush/scrypted/tree/main/plugins

# Installation

## Run on Docker

[Docker Installation Instructions](https://github.com/koush/scrypted/wiki/Docker)

## Run Locally

[Local Installation Instructions](https://github.com/koush/scrypted/wiki/Local-Installation)

## Debug in VSCode

Follow the steps above for running locally to set up your environment.

```sh
# switch to the server directory
cd scrypted/server
npm install
# open this directory in VSCode
code .
```

You can now launch Scrypted in VSCode.

## Plugin Development Documentation

https://developer.scrypted.app

## HomeKit Secure Video Setup

1. Install Scrypted.
2. Open https://localhost:10443/ (substitute localhost appropriately for a remote server).
3. Install the Unifi, HikVision, ONVIF, or Amcrest camera plugin.
   * HKSV requires cameras with motion alerts, and these plugins provide motion alerts.
   * If there's no plugin for your camera, but it supports motion alerts using mail, use the generic RTSP, SMTP plugin, and Dummy Switch plugin. This will create a mail activated motion sensor.
   * If there's no plugin or mail support for your camera, you can install the generic RTSP and the OpenCV motion detector plugin. This will use the processing power on your server to detect camera motion.
4. Install the HomeKit Plugin.
5. Install the Rebroadcast plugin.
    * This is optional but highly recommended. It keeps a short video loop of the stream in memory leading up to the motion.  
6. Pair with the Scrypted Server accessory using your HomeKit app on iOS or Mac.
7. Enable recording on the cameras in HomeKit.
