/**
 *      HomeKit Adapter
 *
 *      License: GNU LGPL
 */

var utils =             require(__dirname + '/lib/utils'); // Get common adapter utils
var objects =           {};
var states =            {};
var enums =             [];

var adapter = utils.adapter({
    name: 'homekit',

    ready: function () {
        getData(function () {
            //adapter.subscribeObjects('*');
            //adapter.subscribeStates('*');

            main();
        });
    },
    objectChange: function (id, obj) {
        adapter.log.debug("objectChange for " + id + " found");
    },
    stateChange: function (id, state) {
        adapter.log.debug("stateChange for " + id + ", state: " + JSON.stringify(state));
    },
    unload: function (callback) {
        callback();
    },
});

var switches = [];
var thermostat = [];
var humidity = [];
var battery = [];
var alarm = [];
var setpoint = [];
var switches = [];
var temperature = [];

function getParent(address) {
    var a = address.split('.');
    var l = a.length;
    var b = "";
    for (var i = 0; i < a.length - 1; i++) {
        b += a[i] + ".";
    }
    return b.substr(0, b.length-1);
}

function getRoot(address) {
    var a = address.split('.');
    if (a.length >= 3) {
        return a[0]+"."+a[1]+"."+a[2];
    } else {
        return address;
    }
}

function getData(callback) {
    var statesReady;
    var objectsReady;

    adapter.log.debug('requesting all states');
    adapter.getForeignStates('*', function (err, res) {
        states = res;
        statesReady = true;
        adapter.log.debug('received all states');
        if (objectsReady && typeof callback === 'function') callback();
    });
    adapter.log.debug('requesting all objects');

    adapter.objects.getObjectList({include_docs: true}, function (err, res) {
        res = res.rows;
        objects = {};
        for (var i = 0; i < res.length; i++) {
            objects[res[i].doc._id] = res[i].doc;
            if (res[i].doc.type === 'enum') enums.push(res[i].doc._id);
            var obj = res[i].doc;
            // TODO: Remove hardcoded WeatherUnderGround
            if (obj._id.search("forecast") < 0) {
                if (obj.common !== undefined && obj.common.role == "value.humidity") {
                    var parent = getParent(obj._id);
                    var pobj = objects[parent];
                    if (pobj.native.PARENT_TYPE != undefined && pobj.native.PARENT_TYPE != "HM-CC-TC") {
                        humidity.push(obj._id);
                    }
                }
                if (obj.common !== undefined && obj.common.role == "value.temperature") thermostat.push(obj._id);
                if (obj.common !== undefined && obj.common.role == "indicator.battery") battery.push(obj._id);
                if (obj.common !== undefined && obj.common.role == "value.battery") battery.push(obj._id);
                if (obj.common !== undefined && obj.common.role == "alarm") alarm.push(obj._id);
                if (obj.common !== undefined && obj.common.role == "level.temperature") setpoint.push(obj._id);
                if (obj.common !== undefined && obj.common.role == "switch") switches.push(obj._id);
            }
        }

        objectsReady = true;
        adapter.log.debug('received all objects');
        if (statesReady && typeof callback === 'function') callback();
    });
}

var HAP = require('hap-nodejs');
var uuid = HAP.uuid;
var Bridge = HAP.Bridge;
var Accessory = HAP.Accessory;
var Service = HAP.Service;
var Characteristic = HAP.Characteristic;

function main() {
    adapter.log.info("hap-nodejs starting...");

    var storage = require('hap-nodejs/node_modules/node-persist');
    var types = require('hap-nodejs/accessories/types');
    var bridgename = adapter.config.bridgename;

    // Initialize our storage system

    var store = adapter.adapterDir + "/../../iobroker-data/homekit.0";
    storage.initSync({ dir: store });

    // Start by creating our Bridge which will host all loaded Accessories
    var bridge = new Bridge(bridgename, uuid.generate(bridgename));

    // Listen for bridge identification event
    bridge.on('identify', function (paired, callback) {
        adapter.log.info("Node Bridge identify:" + paired);
        callback(); // success
    });

    var accessories = adapter.config.Accessories;
    var types = {};

    var map = new Object();

    for (var acc_name in accessories) {
        var accessory = accessories[acc_name];
        for (var obj_name in accessory) {
            var object = accessory[obj_name];
            adapter.log.info("Accessory: " + acc_name + " Object: " + obj_name);
            for (var addr_name in object) {
                var address = object[addr_name];
                // TODO: Check if this accessory is already defined
                if (types[addr_name] == undefined) {
                    types[addr_name] = {};
                }
                types[addr_name][acc_name] = acc_name;
            }
        }
    }

    for (var i = 0; i < humidity.length; i++) {
        var temp = humidity[i];
        if (createAccessory['Humidity']) {
            object = objects[temp];
            accessory = accessories['Humidity'];
            map.object = object;
            map.accessory = accessory;
            map.types = types;

            bridge.addBridgedAccessory(createAccessory['Humidity'](map));
        } else {
            adapter.log.error("UNKNOWN SERVICE");
        }
        map = new Object();
    }

    for (var i = 0; i < temperature.length; i++) {
        var temp = temperature[i];
        if (createAccessory['Temperature']) {
            object = objects[temp];
            accessory = accessories['Temperature'];
            map.object = object;
            map.accessory = accessory;
            map.types = types;

            bridge.addBridgedAccessory(createAccessory['Temperature'](map));
        } else {
            adapter.log.error("UNKNOWN SERVICE");
        }
        map = new Object();
    }

    for (var i = 0; i < thermostat.length; i++) {
        var temp = thermostat[i];
        if (createAccessory['Thermostat']) {
            object = objects[temp];
            accessory = accessories['Thermostat'];
            map.object = object;
            map.accessory = accessory;
            map.types = types;

            bridge.addBridgedAccessory(createAccessory['Thermostat'](map));
        } else {
            adapter.log.error("UNKNOWN SERVICE");
        }
        map = new Object();
    }

    for (var i = 0; i < switches.length; i++) {
        var sw = switches[i];

        object = objects[sw];
        // Homematic Switches have PARENT_TYPE e.g. HM-LC-Sw2-FM
        if (object.native.PARENT_TYPE != undefined) {
            if (createAccessory['Switch']) {
                accessory = accessories['Switch'];
                map.object = object;
                map.accessory = accessory;

                bridge.addBridgedAccessory(createAccessory['Switch'](map));
            } else {
                adapter.log.error("UNKNOWN SERVICE");
            }
        }
        if (object.common.type == "boolean") {
            if (createAccessory['Switch']) {
                accessory = accessories['Switch'];
                map.object = object;
                map.accessory = accessory;

                bridge.addBridgedAccessory(createAccessory['Switch'](map));
            } else {
                adapter.log.error("UNKNOWN SERVICE");
            }
        }
        map = new Object();
    }

    // Publish the Bridge on the local network.
    bridge.publish({
        username: adapter.config.username,
        port: parseInt(adapter.config.port),
        pincode: adapter.config.pincode,
        category: adapter.config.category
    });

    adapter.log.info("Bridge '" + bridgename + "' successfully published");
    adapter.log.debug("UserName: " + adapter.config.username);
    adapter.log.debug("PinCode:  " + adapter.config.pincode);
    adapter.log.debug("Port:     " + adapter.config.port);
    adapter.log.debug("Category: " + adapter.config.category);
}

function identify(settings, paired, callback) {
    adapter.log.debug('< hap ' + settings.name + ' identify ' + paired);
    if (settings.topic.identify) {
        adapter.log.debug('> iobroker ' + settings.topic.identify + " " + settings.payload.identify);
        // TODO: mqtt.publish(settings.topic.identify, settings.payload.identify);
    }
    callback();
}

function setInfos(acc, settings) {
    if (settings.ADDRESS || settings.TYPE) {
        acc.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, "Homematic" || "-")
            .setCharacteristic(Characteristic.Model, settings.TYPE || "-" )
            .setCharacteristic(Characteristic.SerialNumber, settings.ADDRESS || "-");
    }
}

var createAccessory = {
    Humidity: function createAccessory_Humidity(settings) {
        var object = settings.object;
        var accessory = settings.accessory;
        var types = settings.types;

        var s = object._id.split(".");
        var a;
        for (var i = 0; i < s.length-2; i++) {
            if (a === undefined) {
                a = s[i];
            } else {
                a = a + "." + s[i];
            }
        }
        var p = objects[a];
        var t;
        if (p !== undefined && p.native.TYPE !== undefined) {
            t = p.native.TYPE;
        }
        var objName;
        if (object.common.name !== undefined && object.common.name !== "") {
            objName = object.common.name;
        } else {
            var root = getRoot(object._id);
            var robj = objects[root];
            if (robj.common.name !== undefined && robj.common.name !== "") {
                objName = robj.common.name;
            } else {
                objName = object._id;
            }
        }

        var address;
        if (object.native.ADDRESS !== undefined) {
            address = object.native.ADDRESS;
        } else {
            address = object._id;
        }

        var sensorUUID = uuid.generate('hap-nodejs:accessories:humidity:' + address + "_" + objName);
        var sensor = new Accessory(objName, sensorUUID);
        setInfos(sensor, object.native);

        adapter.log.info('> iobroker subscribe Humidity ' + address );

        if (t !== undefined && accessory['CurrentRelativeHumidity'][t] !== undefined) {
            sensor.addService(Service.HumiditySensor)
                .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .on('get', function (callback) {
                    var addr = p._id + "." + accessory['CurrentRelativeHumidity'][t];
                    adapter.log.debug('< hap ' + objName + ' get CurrentRelativeHumidity for ' + addr);

                    adapter.getForeignState(addr, function (err, state) {
                        var value;
                        if (err || !state) {
                            value = 0;
                        } else {
                            value = parseFloat(state.val);
                        }
                        if (callback) callback(null, value);
                    });
                });
        } else {
            sensor.addService(Service.HumiditySensor)
                .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .on('get', function(callback) {
                    var addr = object._id;
                    adapter.log.debug('< hap ' + objName + ' get CurrentRelativeHumidity for ' + addr);

                    adapter.getForeignState(addr, function (err, state) {
                        var value;
                        if (err || !state) {
                            value = 0;
                        } else {
                            value = parseFloat(state.val);
                        }
                        if (callback) callback(null, value);
                    });
                });
        }
        return sensor;
    },
    Temperature: function createAccessory_Temperature(settings) {
        var object = settings.object;
        var accessory = settings.accessory;
        var types = settings.types;

        var s = object._id.split(".");
        var a;
        for (var i = 0; i < s.length-2; i++) {
            if (a === undefined) {
                a = s[i];
            } else {
                a = a + "." + s[i];
            }
        }
        var p = objects[a];
        var t;
        if (p !== undefined && p.native.TYPE !== undefined) {
            t = p.native.TYPE;
        }
        var objName;
        if (object.common.name !== undefined && object.common.name !== "") {
            objName = object.common.name;
        } else {
            var root = getRoot(object._id);
            var robj = objects[root];
            if (robj.common.name !== undefined && robj.common.name !== "") {
                objName = robj.common.name;
            } else {
                objName = object._id;
            }
        }

        var address;
        if (object.native.ADDRESS !== undefined) {
            address = object.native.ADDRESS;
        } else {
            address = object._id;
        }

        var sensorUUID = uuid.generate('hap-nodejs:accessories:temperature:' + address + "_" + objName);
        var sensor = new Accessory(objName, sensorUUID);
        setInfos(sensor, object.native);

        adapter.log.debug('> iobroker subscribe Temperature ' + address );

        if (t !== undefined && accessory['CurrentTemperature'][t] !== undefined) {
            var service = sensor.addService(Service.TemperatureSensor);
            var char = service.getCharacteristic(Characteristic.CurrentTemperature);
            char.setProps({minValue: -100});

            var action = char.on('get', function (callback) {
                var addr = p._id + "." + accessory['CurrentTemperature'][t];
                adapter.log.debug('< hap ' + objName + ' get CurrentTemperature for ' + addr);

                adapter.getForeignState(addr, function (err, state) {
                    var value;
                    if (err || !state) {
                        value = 0;
                    } else {
                        value = parseFloat(state.val);
                    }
                    if (callback) callback(null, value);
                });
            });
        } else {
            var service = sensor.addService(Service.TemperatureSensor);
            var char = service.getCharacteristic(Characteristic.CurrentTemperature);
            char.setProps({minValue: -100});

            var action = char.on('get', function (callback) {
                var addr = object._id;
                adapter.log.debug('< hap ' + objName + ' get CurrentTemperature for ' + addr);

                adapter.getForeignState(addr, function (err, state) {
                    var value;
                    if (err || !state) {
                        value = 0;
                    } else {
                        value = parseFloat(state.val);
                    }
                    if (callback) callback(null, value);
                });
            });
        }
        return sensor;
    },
    Thermostat: function createAccessory_Thermostat(settings) {

        var object = settings.object;
        var accessory = settings.accessory;
        var types = settings.types;

        // TODO: Try to get Parent Device so we can check which Type this Temperature is
        // Homematic Devices have alway PARENT_TYPE set e.g. HM-CC-TC
        var s = object._id.split(".");
        var a;
        for (var i = 0; i < s.length-2; i++) {
            if (a === undefined) {
                a = s[i];
            } else {
                a = a + "." + s[i];
            }
        }
        var p = objects[a];
        var t;
        if (p !== undefined && p.native.TYPE !== undefined) {
            t = p.native.TYPE;
        }

        var objName;
        if (object.common.name !== undefined && object.common.name !== "") {
            objName = object.common.name;
        } else {
            var root = getRoot(object._id);
            var robj = objects[root];
            if (robj.common.name !== undefined && robj.common.name !== "") {
                objName = robj.common.name;
            } else {
                objName = object._id;
            }
        }

        var address;
        if (object.native.ADDRESS !== undefined) {
            address = object.native.ADDRESS;
        } else {
            address = object._id;
        }

        var sensorUUID = uuid.generate('hap-nodejs:accessories:thermostat:' + address + "_" + objName);
        var sensor = new Accessory(objName, sensorUUID);
        setInfos(sensor, object.native);

        adapter.log.debug('> iobroker subscribe Thermostat ' + address );

        if (p != undefined && p._id != undefined) {
            var addr = p._id + "." + accessory['CurrentTemperature'][t];
            adapter.log.debug('< hap ' + objName + ' get CurrentTemperature for ' + addr);

            if (t !== undefined) {
                if (accessory['CurrentTemperature'][t] !== undefined) {
                    sensor.addService(Service.Thermostat)
                        .getCharacteristic(Characteristic.CurrentTemperature)
                        .on('get', function (callback) {
                            var addr = p._id + "." + accessory['CurrentTemperature'][t];
                            adapter.log.debug('< hap ' + objName + ' get CurrentTemperature for ' + addr);

                            adapter.getForeignState(addr, function (err, state) {
                                var value;
                                if (err || !state) {
                                    value = 0;
                                } else {
                                    value = parseFloat(state.val);
                                }
                                if (callback) callback(null, value);
                            });
                        });
                }
                if (accessory['TargetTemperature'][t] !== undefined) {
                    sensor.getService(Service.Thermostat)
                        .getCharacteristic(Characteristic.TargetTemperature)
                        .on('get', function (callback) {
                            var addr = p._id + "." + accessory['TargetTemperature'][t];
                            adapter.log.debug('< hap ' + objName + ' get TargetTemperature for ' + addr);

                            adapter.getForeignState(addr, function (err, state) {
                                var value;
                                if (err || !state) {
                                    value = 0;
                                } else {
                                    value = parseFloat(state.val);
                                }
                                if (callback) callback(null, value);
                            });
                        });
                    /*
                     sensor.getService(Service.Thermostat)
                     .getCharacteristic(Service.CurrentHeatingCoolingState)
                     .on('get', function (callback) {
                     var addr = p._id + "." + accessory['State'][t];
                     adapter.log.debug('< hap ' + objName + ' get State for ' + addr);

                     adapter.getForeignState(addr, function (err, state) {
                     var value;
                     if (err || !state) {
                     value = 0;
                     } else {
                     value = state.val;
                     }

                     if (value == true) {
                     value = 1;
                     } else {
                     value = 0;
                     }
                     if (callback) callback(null, value);
                     });

                     });
                     */
                    sensor.getService(Service.Thermostat)
                        .getCharacteristic(Characteristic.TargetTemperature)
                        .on('set', function (value, callback) {
                            var addr = p._id + "." + accessory['TargetTemperature'][t];
                            adapter.log.debug('< hap ' + objName + ' get TargetTemperature for ' + addr);

                            adapter.setForeignState(addr, {val: value, ack: false});
                            callback();
                        });
                }

                if (accessory['CurrentRelativeHumidity'][t] !== undefined) {
                    sensor.getService(Service.Thermostat)
                        .addCharacteristic(new Characteristic.CurrentRelativeHumidity())
                        .on('get', function (callback) {
                            var addr = p._id + "." + accessory['CurrentRelativeHumidity'][t];
                            adapter.log.debug('< hap ' + objName + ' get CurrentRelativeHumidity for ' + addr);

                            adapter.getForeignState(addr, function (err, state) {
                                var value;
                                if (err || !state) {
                                    value = 0;
                                } else {
                                    value = parseFloat(state.val);
                                }
                                if (callback) callback(null, value);
                            });
                        });
                }
            } else {
//                sensor.addService(Service.Thermostat)
//                    .getCharacteristic(Characteristic.CurrentTemperature)
//                    .on('get', function (callback) {
                var service = sensor.addService(Service.TemperatureSensor);
                var char = service.getCharacteristic(Characteristic.CurrentTemperature);
                char.setProps({minValue: -100});

                var action = char.on('get', function (callback) {
                    var addr = object._id;
                    adapter.log.debug('< hap ' + objName + ' get CurrentTemperature for ' + addr);

                    adapter.getForeignState(addr, function (err, state) {
                        var value;
                        if (err || !state) {
                            value = 0;
                        } else {
                            value = parseFloat(state.val);
                        }
                        if (callback) callback(null, value);
                    });
                });
            }
        } else {
//            sensor.addService(Service.Thermostat)
//                .getCharacteristic(Characteristic.CurrentTemperature)
//                .on('get', function (callback) {
            var service = sensor.addService(Service.TemperatureSensor);
            var char = service.getCharacteristic(Characteristic.CurrentTemperature);
            char.setProps({minValue: -100});

            var action = char.on('get', function (callback) {
                var addr = object._id;
                adapter.log.debug('< hap ' + objName + ' get CurrentTemperature for ' + addr);

                adapter.getForeignState(addr, function (err, state) {
                    var value;
                    if (err || !state) {
                        value = 0;
                    } else {
                        value = parseFloat(state.val);
                    }
                    if (callback) callback(null, value);
                });
            });
        }
        return sensor;
    },
    Switch: function createAccessory_Switch(settings) {

        var object = settings.object;
        var accessory = settings.accessory;

        var objName;
        if (object.common.name !== undefined && object.common.name !== "") {
            objName = object.common.name;
        } else {
            var root = getRoot(object._id);
            var robj = objects[root];
            if (robj.common.name !== undefined && robj.common.name !== "") {
                objName = robj.common.name;
            } else {
                objName = object._id;
            }
        }

        var address;
        if (object.native.ADDRESS !== undefined) {
            address = object.native.ADDRESS;
        } else {
            address = object._id;
        }

        var sensorUUID = uuid.generate('hap-nodejs:accessories:switch:' + address + "_" + objName);
        var sensor = new Accessory(objName, sensorUUID);
        setInfos(sensor, object.native);

        adapter.log.debug('> iobroker subscribe Switch ' + address );

        sensor.addService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .on('get', function (callback) {
                var addr;
                // Homematic Switches have PARENT_TYPE e.g. HM-LC-Sw2-FM
                if (object.native.PARENT_TYPE != undefined) {
                    addr = object._id + accessory['State'][object.native.PARENT_TYPE];
                } else {
                    addr = object._id;
                }
                adapter.log.error('< hap ' + objName + ' get Switch for ' + addr);

                adapter.getForeignState(addr, function (err, state) {
                    var value;
                    if (err || !state) {
                        value = 0;
                    } else {
                        value = state.val;
                    }
                    if (callback) callback(null, value);
                });
            });

        sensor.getService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .on('set', function(value, callback) {
                var addr;
                // Homematic Switches have PARENT_TYPE e.g. HM-LC-Sw2-FM
                if (object.native.PARENT_TYPE != undefined) {
                    addr = object._id + accessory['State'][object.native.PARENT_TYPE];
                } else {
                    addr = object._id;
                }
                adapter.log.debug('< hap ' + objName + ' set Switch for ' + addr);

                adapter.setForeignState(addr, value == "0" ? false : true);
                callback();
            });

        return sensor;
    }
};
