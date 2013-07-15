var net = require('net');
var mqtt = require('mqtt');
var crc = require('crc');

var PORT = 10002;
var HOST='192.168.10.131';
var CONFIG='config';
var PAUSE=3000;
var INTERVAL=200;
var TIMEOUT=1000;
var MQTT_HOST='192.168.10.13';
var MQTT_PORT=1883;
var MQTT_ROOT='raw/calenta/';
var MQTT_LOGGING_ROOT='logging/calenta/';


var commandQueue = [];
var CMD_ID1   = [0x02, 0xfe, 0x00, 0x05, 0x08, 0x01, 0x0b, 0xd4, 0x9c, 0x03];
var CMD_ID2   = [0x02, 0xfe, 0x01, 0x05, 0x08, 0x01, 0x0b, 0xe9, 0x5c, 0x03];
var CMD_ID3   = [0x02, 0xfe, 0x03, 0x05, 0x08, 0x01, 0x0b, 0x90, 0x9c, 0x03];
var CMD_SMPL  = [0x02, 0xfe, 0x01, 0x05, 0x08, 0x02, 0x01, 0x69, 0xab, 0x03];
var CMD_CNT1  = [0x02, 0xfe, 0x00, 0x05, 0x08, 0x01, 0x0b, 0xd4, 0x9c, 0x03];
var CMD_CNT2  = [0x02, 0xfe, 0x00, 0x05, 0x08, 0x10, 0x1c, 0x98, 0xc2, 0x03];
var CMD_CNT3  = [0x02, 0xfe, 0x00, 0x05, 0x08, 0x10, 0x1d, 0x59, 0x02, 0x03];
var CMD_CNT4  = [0x02, 0xfe, 0x00, 0x05, 0x08, 0x10, 0x1e, 0x19, 0x03, 0x03];
var CMD_CNT5  = [0x02, 0xfe, 0x00, 0x05, 0x08, 0x10, 0x1f, 0xd8, 0xc3, 0x03];
var SAMPLE_ID = 0x0201;
var BLOCK_ID  = 0x0102;
var LOCK_ID   = 0x0103;
var COUNT_ID  = 0x0101;
var COUNT1_ID = 0x101c;
var COUNT2_ID = 0x101d;


var timeoutId;
var toCount=0;
var values=[];
          
var mqttc = mqtt.createClient(MQTT_PORT, MQTT_HOST, {
 keepalive: 30000
});

function log(s){
  mqttc.publish(MQTT_LOGGING_ROOT, s);  
}
   
mqttc.on('connect', function() {});

function enQueueCommands(){
  commandQueue.push(CMD_ID1);
  commandQueue.push(CMD_ID2);  
  commandQueue.push(CMD_ID3);  
  commandQueue.push(CMD_SMPL);  
  commandQueue.push(CMD_CNT1);  
  commandQueue.push(CMD_CNT2);  
  commandQueue.push(CMD_CNT3);  
  commandQueue.push(CMD_CNT4);
  commandQueue.push(CMD_CNT5);    
  setTimeout(function(){ processQueue();},PAUSE);  
}


function processQueue(){
  if (commandQueue.length > 0) {
    var cmd = commandQueue.shift();
    buffer = new Buffer(cmd);
    timeoutId=setTimeout(function(){toCount++;processQueue();}, TIMEOUT);
    socket.write(buffer);        
  }
  else {
    enQueueCommands();
  };
}

var socket = net.createConnection(PORT, HOST); 
socket.on('data', function(data) {
  clearTimeout(timeoutId);
  processData(data);    
});
  
socket.on('connect', function(connect ) {
  enQueueCommands();
});

function searchID(id){
  for(var i = 0; i < values.length; i++){
    if(values[i].name == id){
      return i;
    }
  }
  return -1;
}

function newValue(id, newval){
  ix=searchID(id);
  if (ix>=0){
    if(values[ix].prev!==newval){
      values[ix].prev=newval;
      mqttc.publish(MQTT_ROOT+id, newval.toString());      
    }
  } else {
    values.splice(0,0, {"name":id, "prev": newval });
    mqttc.publish(MQTT_ROOT+id, newval.toString());
  }
}                          

function processData(data){
  log(' < '+data.toString('hex'));  
  
  var lenbyte = data[4];
  if (data.length === lenbyte+2){
    var crcpayload = data.slice(1,data.length-3)
    var buf = new Buffer(crcpayload);
    var scrc = (data[data.length-2]*256)+data[data.length-3];
    var ccrc = crc.crcModbusHex(buf);
    if (scrc == ccrc){
      var packetid=(data[5]<<8)+data[6];
      var pubdata=[];
      var offset=7;
      switch (packetid){
      case SAMPLE_ID: 
        newValue('status',data[offset+40]);
        newValue('substatus',data[offset+43]);
        newValue('locking',data[offset+41]);
        newValue('blocking',data[offset+42]);
        newValue('flowtemp',Math.round(((data[offset+1]*256)+data[offset+0])/10)/10);
        newValue('returntemp',Math.round(((data[offset+3]*256)+data[offset+2])/10)/10);
        //newValue('caloritemp',((data[offset+9]*256)+data[offset+8])/100);
        if ((data[offset+6]==0x00) && (data[offset+7]==0x80)) {
          newValue('outsidetemp',0.0);
        } else {
          newValue('outsidetemp',Math.round(((data[offset+7]*256)+data[offset+6])/10)/10);
        };
        newValue('controltemp',Math.round(((data[offset+52]*256)+data[offset+51])/10)/10);
        newValue('intsetpoint',Math.round(((data[offset+28]*256)+data[offset+27])/10)/10);
        newValue('chsetpoint',Math.round(((data[offset+17]*256)+data[offset+16])/10)/10);
        newValue('dhwsetpoint',Math.round(((data[offset+19]*256)+data[offset+18])/10)/10);
        if ((data[offset+4]==0x00) && (data[offset+5]==0x80)) {
          newValue('solartemp',0.0);
        } else {
          newValue('solartemp',Math.round(((data[offset+5]*256)+data[offset+4])/10)/10);
        }
        if ((data[offset+14]==0x00) && (data[offset+15]==0x80)) {
          newValue('roomtemp',0.0);
        } else {
          newValue('roomtemp',Math.round(((data[offset+15]*256)+data[offset+14])/10)/10);
        }
        if ((data[offset+20]==0x00) && (data[offset+21]==0x80)) {
          newValue('roomsetpoint',0.0);
        } else {
          newValue('roomsetpoint',Math.round(((data[offset+21]*256)+data[offset+20])/10)/10);
        }
        newValue('boilcontroltemp',Math.round(((data[offset+13]*256)+data[offset+12])/10)/10);
        newValue('fansetpoint',((data[offset+23]*256)+data[offset+22])/100);
        newValue('fanspeed',(data[offset+25]*256)+data[offset+24]);
        newValue('ioncurrent',data[offset+26]);
        newValue('pumppercent',data[offset+30]);
        newValue('waterpressure',data[offset+49]/10);
        newValue('dhwflow',((data[offset+54]*256)+data[offset+53])/100);
        newValue('actualpower',data[offset+33]);
        newValue('availpower',data[offset+29]);
        newValue('reqoutput',data[offset+32]);
        newValue('modheatdemand',(data[offset+36]&(1<<1))!=0?1:0);
        newValue('onoffheatdemand',(data[offset+36]&(1<<2))!=0?1:0);
        newValue('ignition',(data[offset+38]&(1<<2))!=0?1:0);
        newValue('gasvalve',((data[offset+38]&1<<0)!=0?0:1));
        newValue('ionisation',data[offset+37]&(1<<2));
        newValue('pumpon',(data[offset+39]&1<<0)!=0?1:0);
        newValue('threewayvalve',(data[offset+38]&(1<<3))!=0?1:0);
        newValue('dhwheatdemand',(data[offset+36]&(1<<7))!=0?1:0);
        newValue('dhweco',((data[offset+36]&(1<<4))!=0?0:1));
        newValue('modcontroller',(data[offset+36]&1<<0)!=0?1:0);
        newValue('frostprotect',(data[offset+36]&(1<<2)!=0?1:0));
        newValue('dhwblocking',(data[offset+36]&(1<<5))!=0?1:0);
        newValue('legionella',(data[offset+36]&(1<<6))!=0?1:0);
        newValue('shutdowninput',((data[offset+37]&1<<0)!=0?0:1));
        newValue('releaseinput',((data[offset+37]&(1<<1))!=0?0:1));
        newValue('dhwflowswitch',(data[offset+37]&(1<<3))!=0?1:0);
        newValue('mingaspress',(data[offset+37]&(1<<5))!=0?1:0);
        newValue('chenable',(data[offset+37]&(1<<6))!=0?1:0);
        newValue('dhwenable',(data[offset+37]&(1<<7))!=0?1:0);
        newValue('ext3wayvalve',(data[offset+38]&(1<<4))!=0?1:0);
        newValue('extgasvalve',(data[offset+38]&(1<<6))!=0?1:0);
        newValue('caloripump',(data[offset+39]&(1<<1))!=0?1:0);
        newValue('extchpump',(data[offset+39]&(1<<2))!=0?1:0);
        newValue('statusreport',(data[offset+39]&(1<<4))!=0?1:0);
        newValue('otsmartpower',(data[offset+39]&(1<<7))!=0?1:0);
        newValue('hruactive',(data[offset+50]&(1<<1))!=0?1:0);
        newValue('hmibacklight',(data[offset+50]&(1<<2))!=0?1:0);        
        break;
        
      case COUNT1_ID:
        newValue('powerhrs',((data[offset+8]*256)+data[offset+9])*2);
        newValue('pumphrs_chdhw',((data[offset+0]*256)+data[offset+1])*2);
        newValue('runhrs_chdhw',((data[offset+4]*256)+data[offset+5])*2);
        newValue('runhrs_dhw',((data[offset+6]*256)+data[offset+7]));
        newValue('pumpstarts',((data[offset+10]*256)+data[offset+11])*8);
        newValue('valvecycles',((data[offset+12]*256)+data[offset+13])*8);
        newValue('valverunhrsdhw',((data[offset+2]*256)+data[offset+3])*2);
        newValue('burnstartsdhw',((data[offset+14]*256)+data[offset+15])*8);
        break;

      case COUNT2_ID:
        newValue('burnstarts',((data[offset+0]*256)+data[offset+1])*8);
        newValue('failedburnstarts',((data[offset+2]*256)+data[offset+3])*2);
        newValue('flameloss',((data[offset+4]*256)+data[offset+5])*2);      
        break;

      case COUNT_ID: 
        log('Counter packet');
        break;
      default : //log('??? packet');     
      }
      if (pubdata.length > 0){      
        for (var i = 0; i<pubdata.length;i++){
          var pubitem = pubdata[i];
          for(var item in pubitem){
            mqttc.publish(MQTT_ROOT+item, pubitem[item].toString());
          }         
        }
      }
    } else {
      log('Invalid checksum!');
    }
  } else {
    log('Length incorrect!');
  };
  setTimeout(function(){processQueue();}, INTERVAL);
}
