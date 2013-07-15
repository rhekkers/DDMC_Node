net = require('net');
var mqtt = require('mqtt');
//var connections = [];

function log(s){
 console.log(s);
}

var mqttc = mqtt.createClient(1883, '192.168.10.13', {
  keepalive: 30000
});
 
mqttc.on('connect', function() {
  //log('Connected to broker');
});

mqttc.on('end', function() {
  //log('Disconnected');
});
 
net.createServer(function (socket) {
 
  socket.on('data', function (data) {
    //console.log(time + " | "+data);
    //var newDate = new Date();
    //var time = newDate.toLocaleTimeString();
    var spldata = data.toString().split(';');
    //console.log(spldata.length);
    //console.log(spldata[2]);
    if (spldata.length >= 3){
      //console.log(time + " | "+spldata[2]);    
      mqttc.publish('raw/mbtx1/light',spldata[2]);          
    }
  });
 
  socket.on('end', function () {
    //var newDate = new Date();
    //var time = newDate.toLocaleTimeString();
    //console.log(time + " | " + socket.name + " ended the connection");
    //connections.splice(connections.indexOf(socket), 1);
  });
}).listen(8002);
 
//console.log("Server listening on port 8002\n");

