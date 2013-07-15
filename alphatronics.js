net = require('net');
tools = require("./tools");


var HOST = '192.168.10.83';
var PORT = 2101;

tools.createMQTTClient();

var client = new net.Socket();
client.connect(PORT, HOST, function() {
});

client.on('data', function(chunk) {
  tools.log("alpha", "< "+chunk.toString());            
  processData(chunk.toString());    
});

client.on('close', function() {  
  tools.log("alpha", "Connection closed");  
}); 

var buff = [];
var prvpacket;
var packetfound=false;

function processData(data){ 
  buff += data;  
  packetfound=false;
  packet = [];

  // always start with #
  hashix = buff.indexOf("#");
  if(hashix > 0){
    buff = buff.substring(hashix);
  }
  
  if(buff.length >= 24){
    packet = buff.substring(1);
    if(packet.substring(0,17) !== prvpacket){
      valid = true;
      
      for(p=0;p<packet.length;p++){
        
        //0123456789012345678901
        //P15957542:..s.T.A.@043
        //K01427109:.......4@104
          
        switch(true){
        case (p==0):
          if ((packet[p]!=="P") && (packet[p]!=="K")) valid = false;
          break;
        case ((p>=1) && (p<=8)):
          if(parseInt(packet[p],10) == NaN) valid = false;
          break;
        case (p==9):
          if (packet[p]!==":") valid = false;
          break;
        case ((p>=9) && (p<=17)):
          break;
        case (p==18):
          break;
        case ((p>=18) && (p<=21)):
          break;
        }
        if(!valid) break;
      }
      if(valid){
        prvpacket = packet.substring(0,17);
        addr = packet.substring(1,9);
        switch(packet[0]){
          case "P":
            tools.newValue(addr+"/restore",     (packet[13]=="R"?1:0).toString());
            tools.newValue(addr+"/alive",       (packet[14]=="T"?1:0).toString());
            tools.newValue(addr+"/batt",        (packet[15]=="B"?1:0).toString());
            tools.newValue(addr+"/alert",       (packet[16]=="A"?1:0).toString());
            tools.newValue(addr+"/tamper",      (packet[17]=="S"?1:0).toString());
            tools.newValue(addr+"/level",        packet.substring(19,22));
            break;
          case "K":
            tools.newValue(addr+"/armaway", (packet[14]=="1"?1:0).toString(), true);
            tools.newValue(addr+"/armhome", (packet[15]=="2"?1:0).toString(), true);
            tools.newValue(addr+"/disarm",  (packet[16]=="3"?1:0).toString(), true);
            tools.newValue(addr+"/aux",     (packet[17]=="4"?1:0).toString(), true);
            tools.newValue(addr+"/level",    packet.substring(19,22));            
            break;
        }
      } 
    }
    buff = buff.substring(24);
  }
}
