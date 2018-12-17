﻿var wmbus = require('wmbus-client')
var meter = new wmbus.KamstrupMultical21Meter();
var filterApplied = false;
module.exports = function (RED) {

    //configure the node
    function initNode(node, config) {
        RED.nodes.createNode(node, config);
        //get the configuration
        let dongleConfig = RED.nodes.getNode(config.wmbusdongle);

        node.serialnumber = config.serialnumber;


        //If nothing was configured then exit with false
        if (!dongleConfig) {
            node.debug("No config for wmbus");
            return false;
        }

        let client = dongleConfig.wmbusClient;

        client.on("connected", function () {
            if (filterApplied)
                node.status({ fill: "green", shape: "dot", text: "connected" });
            else
                node.status({ fill: "yellow", shape: "dot", text: "Applying filter for serial no: " + node.serialnumber});
        });

        client.on("disconnected", function () {
            node.status({ fill: "red", shape: "ring", text: "disconnected" });
        });

        client.on("error", function () {
            node.status({ fill: "red", shape: "dot", text: "Error connecting" });
        });

        client.on("data", function (telegram) {
            NewData(telegram, node.credentials.aeskey, node.serialnumber, node);
        });
        

        //let all packages get handled by this meter
        meter.applySettings({
            disableMeterDataCheck: true
        });


        node.debug("Setup complete");
        return true;
    }
    /**
     * Function is used to bute swap a buffer. First byte becomes the last one
     * @param {any} buffer
     */
    function reverseBuffer(buffer) {
        let t = Buffer.alloc(buffer.length)
        for (let i = 0, j = buffer.length - 1; i <= j; ++i, --j) {
            t[i] = buffer[j];
            t[j] = buffer[i];
        }
        return t;
    }

    function NewData(telegram, aesKey, serialNo, node) {
        try {
            //process the meter, if it can't be processed then exit
            if (!meter.processTelegramData(telegram, { aes: aesKey }))
                return;
        } catch (e) {
            node.error(e);
            node.status({ fill: "red", shape: "dot", text: e.message });
        }
        

        //Check if this package fits the serial number, if not find the first package which fits and use that as filter
        if (!filterApplied) {

            //Check if the serial number of this meter match the supplied, if yes then apply the filter
            var thisSerialNo = reverseBuffer(meter.getAddressField(telegram).slice(2, 6)).toString("hex");
            if (thisSerialNo == serialNo) {

                meter.applySettings({
                    disableMeterDataCheck: true,
                    filter: [meter.getAddressField(telegram).toString("hex")]
                });
                node.log("Found serial and applied filter.");
                node.status({ fill: "green", shape: "dot", text: "connected" });
                filterApplied = true;
            }
            else {
                node.log(thisSerialNo + " is not the correct serial no for this node");
                return;
            }
                

        }
    
        let infoDry = meter.getInfoCodeDry(telegram);
        let infoReverse = meter.getInfoCodeReverse(telegram);
        let infoBurst = meter.getInfoCodeBurst(telegram);
        let infoLeak = meter.getInfoCodeLeak(telegram);
        let durationDry = meter.getInfoCodeDryDuration(telegram);
        let durationReverse = meter.getInfoCodeReverseDuration(telegram);
        let durationBurst = meter.getInfoCodeBurstDuration(telegram);
        let durationLeak = meter.getInfoCodeLeakDuration(telegram);
        let currentValue = meter.getMeterValue(telegram);
        let monthStartValue = meter.getMeterTargetValue(telegram);
        let sn = meter.getAddressField(telegram).toString('hex');
        //generate a payload
        let msg = {
            payload: {
                currentValue: currentValue,
                monthStartValue: monthStartValue,
                meterDry: infoDry,
                dryDuration: durationDry,
                reverseFlow: infoReverse,
                reverseDuration: durationReverse,
                burst: infoBurst,
                burstDuration: durationBurst,
                leak: infoLeak,
                leakDuration: durationLeak
            }
        };
        //Send it
        node.send(msg);


    }

    function Kamstrup21Node(config) {
        //configure the node
        if (!initNode(this, config))
            return;


    }
    RED.nodes.registerType("kamstrup21", Kamstrup21Node, {
        credentials: {
            aeskey: { type: "password" }
        }
    });


}
