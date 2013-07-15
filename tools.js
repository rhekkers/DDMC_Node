/* node-nma
* https://github.com/randallagordon/node-nma
*
* Copyright (c) 2012 Randall A. Gordon <randall@randallagordon.com>
* Licensed under the MIT License
*
*/

var request = require("request");
var mqtt = require("mqtt");
var MQTT_ROOT='raw/';
var MQTT_LOGGING_ROOT='logging/';

 
exports.notify = function(application, event, description, priority, url, contentType ) {
  var endpoint = "https://www.notifymyandroid.com/publicapi/notify";
  var data = {
    form : {
      "apikey": "0eb55a945d1215e34b20f8d1855db36ed0d99e6f157e4327",
      "application": application,
      "event": event,
      "description": description,
      "priority": priority,
      "url": url,
      "content-type": contentType
    }
  };

  var r = request.post(endpoint, data, function ( error, response, body ) {
  });
}



// duplicate filter & publish only changes
var mqttc;
var values=[];

function searchID(id){
  for(var i = 0; i < values.length; i++){
    if(values[i].name == id){
      return i;
    }
  }
  return -1;
}
                    

exports.newValue = function(id, newval, alwayspub){
  if (arguments.length == 2) {
    alwayspub = false;    
  }
  if(alwayspub){
    mqttc.publish(MQTT_ROOT+id, newval.toString());  
  } else {
    ix=searchID(id);
    //console.log("search "+id+" "+ix);
    if (ix>=0){
      if(values[ix].prev!==newval){
        //console.log("changed:"+ values[ix].name+" "+values[ix].prev+" <> "+newval);
        values[ix].prev=newval;
        mqttc.publish(MQTT_ROOT+id, newval.toString());
      } else {
        //nothing changed
      }
    } else {
      //console.log("new:"+ id+" "+newval);
      values.splice(0,0, {"name":id, "prev": newval });
      mqttc.publish(MQTT_ROOT+id, newval.toString());
    }
  }
}


exports.createMQTTClient = function(callback){
  mqttc = mqtt.createClient(1883, "192.168.10.13", {
    keepalive: 30000
  });
  mqttc.on('connect',function(){
    if(callback){
      callback();
    }
  });
}

exports.mqttSubscribe = function(topic, callback){
  mqttc.subscribe(topic); 
  if(callback){
    mqttc.on('message', function(topic, payload){
      callback(topic, payload);
    });
  }
}

exports.log =  function(drv,s){
  mqttc.publish(MQTT_LOGGING_ROOT+drv, s.toString());  
}