net = require('net');
var mqtt = require('mqtt');
var tools = require("./tools");

//var mqttc = mqtt.createClient(1883, '192.168.10.13', {
//  keepalive: 30000
//  });
//  
//  mqttc.on('connect', function() {
//    mqttc.subscribe('command/roomba');
//    mqttc.on('message', function(topic, message) {
//      //console.log('topic: ' + topic + ' payload: ' + message);
//  });
//});

tools.createMQTTClient();              
 
net.createServer(function (socket) {
  socket.name = socket.remoteAddress + ":" + socket.remotePort 
 
  socket.on('data', function (data) {
    var newDate = new Date();
    var time = newDate.toLocaleTimeString();
    //mqttc.publish('logging/roomba563',time + " | " + socket.name + " < " + data);    
    var obj = eval('('+data+')');    
    for(var key in obj.ROOMBA){
      //console.log(time + " | "+key+" "+obj.ROOMBA[key]);
      //mqttc.publish('raw/roomba563/'+key, obj.ROOMBA[key]);
      tools.newValue("roomba563/"+key, obj.ROOMBA[key]);      
    }    
  });
 
  socket.on('end', function () {
    var newDate = new Date();
    var time = newDate.toLocaleTimeString();
    //console.log(time + " | " + socket.name + " ended the connection");
  });
}).listen(8001);
 
//console.log("Server listening on port 8001\n");

