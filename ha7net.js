var net = require('net');
var mqtt = require('mqtt');
var crc = require('crc');
var request = require('request');
var tools = require("./tools");

var PORT = 10002;
var HOST='192.168.10.95';
var CONFIG='config';
var PAUSE=3000;
var INTERVAL=200;
var TIMEOUT=1000;

var BASE   = 'http://ha7net.hekkers.lan';
var SEARCH = '/1Wire/Search.html';
var WRITEBLOCKPFX = '/1Wire/WriteBlock.html?Address=';
var WRITEBLOCKSFX = '&Data=A5FF01FFFFFFFFFFFFFFFFFFFFFF';
var READTEMP = '/1Wire/ReadTemperature.html?Address_Array=';
var READDS18B20 = '/1Wire/ReadDS18B20.html?DS18B20Request=';

var commandQueue = [];
var timeoutId;
var toCount=0;
var oneWireDevices = [];
var temp10Sensors=[];
var temp28Sensors=[];  
var iCommand = 0;          
var iBlock=0;
var aBlock='';


tools.createMQTTClient();

function searchDevices(){
  var endpoint = BASE+SEARCH;
  var data = '';
  var r = request.get(endpoint, data, function ( error, response, body ) {
    var re = / (ID="ADDRESS_(\d+)" TYPE="text" VALUE="([\da-fA-F]{16})">\n)/g;
    while (match = re.exec(response.body.toString())) {
      var re2 = /ID="ADDRESS_(\d+)" TYPE="text" VALUE="([\da-fA-F]{16})"/g;
      var m2 = re2.exec(match[1]);
      oneWireDevices.push(m2[2]);
    }    
    enQueueCommands();
  });
}

function enQueueCommands(){

  var owaddr='';
  var fmlc=0;
  
  if(oneWireDevices.length>0){
    for(i=0;i<oneWireDevices.length;i++){    
      owaddr=oneWireDevices[i];
      fmlc = parseInt(owaddr.substr(14,2), 16);
      switch(fmlc){
      case 0x1d:
        commandQueue.push(WRITEBLOCKPFX+owaddr+WRITEBLOCKSFX);
        iBlock=commandQueue.length-1;
        aBlock=owaddr;
        break;
      case 0x10:
        temp10Sensors.push(owaddr);
        break;
      case 0x28:
        temp28Sensors.push('{'+owaddr+',9}');
        break;
      default:
    }
    }
  }
  if (temp10Sensors.length > 0){
    commandQueue.push(READTEMP+temp10Sensors.join(','));
  }
  if (temp28Sensors.length > 0){
    commandQueue.push(READDS18B20+temp28Sensors.join(','));
  }  
}

function processQueue()
{
  if (commandQueue.length > 0) {
    var cmd = commandQueue[iCommand];    
    //timeoutId=setTimeout(function(){toCount++;processQueue();}, TIMEOUT);
    var data='';
    var r = request.get(BASE+cmd.toString(), data, function ( error, response, body ) {
      processData(response.body.toString());
      iCommand++;
      if(iCommand>=commandQueue.length){
        iCommand=0;
      };
      setTimeout(function(){processQueue();}, 3000);      
    });    
  };
}

function processData(response){

  switch(iCommand){
  case iBlock:
    var reb= /"ResultData_0".*VALUE="([\da-fA-F]{24})([\da-fA-F]{4})"/g;
    if (match = reb.exec(response.toString())){
      var value=match[1].substr(14,2)+match[1].substr(12,2)+match[1].substr(10,2)+match[1].substr(8,2);
      var intvalue=parseInt(value,16);
      tools.newValue(aBlock+'/water', intvalue.toString());
    }
    break;
    
  default:
    var rea = / ID="Address_(\d+)" TYPE="text" VALUE="([\da-fA-F]{16})"/g;
    while (match = rea.exec(response.toString())) {
      var id = match[1];
      var addr =  match[2];
      var rets = 'ID="Temperature_'+id.toString()+'" TYPE="text" VALUE="([0-9\.]+)">';      
      var ret = new RegExp(rets, "g");
      if (m2 = ret.exec(response)) {
        if(m2[1]!='85'){
          tools.newValue(addr+'/temp',m2[1]);
          
        }
      }
    }        
    break;
  }
}
                                  
searchDevices();
setTimeout(function(){processQueue();}, 10000);
