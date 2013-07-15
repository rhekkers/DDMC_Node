net = require("net");
var mqtt = require("mqtt");
tools = require("./tools");

var RFXHOST = '192.168.10.11';
var RFXPORT = 8080;
var RFXMODE = 0x41;
var EXCLUDEDHOUSECODES = "XYZ";

tools.createMQTTClient();


var HOST1 = '192.168.10.133';
var HOST2 = '192.168.10.131';
var PORT = 10001;

var bytecnt=0;
var bytesReceived=0;
var waitforRest=false;
var waitforAck=false;
var comdata = "";
var buff=[];
var rfxMeter=false;
var recbits=0;

// create socket, send initialization command after connect and socket event hadlers

// RFXCOM 1, RFXCOM Receiver for X10/Visonic/Oregon (extended)
// RFXCOM 2, RFXCOM Receiver for X10/KAKU/ELRO

var client1 = new net.Socket();
client1.connect(PORT, HOST1, function() {
    data=[0xf0, RFXMODE];
    needACK=true;
    client1.write(data.toString());    
});

client1.on('data', function(data) {    
    if(needACK){
      needACK=false;
    } else {
      tools.log("rfxrx", "<1 "+data.toString("hex"));      
      processData(data);
    }
});
client1.on('close', function() {
  tools.log("rfxrx", "Connection closed");  
});

// create socket, send initialization command after connect and socket event hadlers
var client2 = new net.Socket();
client2.connect(PORT, HOST2, function() {
    data=[0xf0, RFXMODE];
    needACK=true;
    client2.write(data.toString());    
});

client2.on('data', function(data) {    
    if(needACK){
      needACK=false;
    } else {
      tools.log("rfxrx", "<2 "+data.toString("hex"));  
      processData(data);
    }
});

client2.on('close', function() {
  tools.log("rfxrx", "Connection closed");  
});

// packet processing
function processData(packet){ 
  comdata = packet;
  if(!waitforRest) bytecnt=0;
  do{
    rfxMeter = false;
    while (comdata.length > 0){    
      rfxMeter = false;
      temp = comdata[0];
      if(buff.length > 15)
      {
        buff = [];
        bytesReceived = 0;
        waitforRest = false;
        //bytecnt=0;
        return;
      } else {
        if(bytecnt == 0){
          recbits = temp & 0x7f;
          if((recbits & 0x07) == 0){
            bytesReceived = (recbits & 0x7f) >> 3;
          } else {
            bytesReceived = ((recbits & 0x7f) >> 3) + 1;
          }
          //tools.log("rfxrx","bits="+recbits.toString());
          buff.push(comdata[0]);
        } else {          
          if(bytecnt == bytesReceived){
            buff.push(comdata[0]);
            comdata = comdata.slice(1);
            if(bytecnt == 6){
              parity = 0;
              parity = parity + (buff[1] >> 4) + (buff[1] & 0x0f);
              parity = parity + (buff[2] >> 4) + (buff[2] & 0x0f);
              parity = parity + (buff[3] >> 4) + (buff[3] & 0x0f);
              parity = parity + (buff[4] >> 4) + (buff[4] & 0x0f);
              parity = parity + (buff[5] >> 4) + (buff[5] & 0x0f);
              parity = parity + (buff[6] >> 4);
              parity = (~parity) & 0x0f;
              if(parity == (buff[6] & 0x0f) && (buff[1] + (buff[2] ^ 0x0f)) == 0xff){
                rfxMeter = true;
              } else {
                rfxMeter = false;
              }              
            }
            // handle bytes
            break;
          } else {
            buff.push(comdata[0]);
          }
        }
      }
      comdata = comdata.slice(1);
      bytecnt++;
    } //while
    if(waitforAck){
      buff = [];
      bytesReceived = 0;
      waitforACK = false;
      //console.log("Received ACK");
      return;
    }
    if((bytecnt < bytesReceived) || (buff.length != (bytesReceived+1))){
      waitforRest = true;
      return;
    }
    if(bytecnt > bytesReceived){
      waitforRest = false;
      return;
    }
    waitforRest = false;
    if(buff.length <= 1){
      return;
    }
    if(rfxMeter){      
      processRFXMeter();
    } else {
      if((recbits == 36) || (recbits == 66) || (recbits == 72)){
        processVisonic();
      } else {
        if(recbits > 59){
          if(!processOregon()){
            processVisonic();
          }
        } else {
          if(recbits == 34){
            processKAKU();
          } else {
            processX();
          }
        }
      }
    }  
    if(buff.length > 0){
      logBadPacket();
      comdata="";
    }
    buff = [];
    bytesReceived = 0;
    recbits = 0;
    bytecnt = 0;
  } while (comdata.length > 0); 
  //tools.log("rfxrx", "Done.");  
}

function processRFXMeter(){
  addr = buff[1] * 256 + buff[2];
  if((buff[6] & 0xf0) == 0){
    value = (buff[5] * 65536) + (buff[3] * 256) + buff[4];
    var pad = "0000";
    addr = addr.toString(16).toUpperCase();
    topic = pad.substring(0, pad.length-addr.length)+addr+"/count";
    payload = value.toString();
    tools.newValue(topic, payload);
    buff=[];
  }
  //buff=[];
}



function visonicCS(){
  var parity = 0;
  // even parity on LSBs of all nibbles
  parity = 0;
  if (buff[1] & 0x10 != 0 ){parity++};  
  if (buff[1] & 0x01 != 0 ){parity++};
  if (buff[2] & 0x10 != 0 ){parity++};
  if (buff[2] & 0x01 != 0 ){parity++};
  if (buff[3] & 0x01 != 0 ){parity++};
  if (buff[3] & 0x10 != 0 ){parity++};
  if (buff[4] & 0x01 != 0 ){parity++};
  if (buff[4] & 0x10 != 0 ){parity++};
  if (buff[5] & 0x10 != 0 ){parity++};
  if((parity & 0x01) != 0){
    tools.log("rfxrx",'B0 Parity error');
    return false;
  }
  
  parity = 0;
  if (buff[1] & 0x20 != 0){parity++};  
  if (buff[1] & 0x02 != 0){parity++};
  if (buff[2] & 0x20 != 0){parity++};
  if (buff[2] & 0x02 != 0){parity++};
  if (buff[3] & 0x02 != 0){parity++};
  if (buff[3] & 0x20 != 0){parity++};
  if (buff[4] & 0x02 != 0){parity++};
  if (buff[4] & 0x20 != 0){parity++};
  if (buff[5] & 0x20 != 0){parity++};
  if((parity & 0x01) != 0){
    tools.log("rfxrx",'B1 Parity error');
    return false;
  }  
  
  parity = 0;
  if (buff[1] & 0x40 != 0){parity++};  
  if (buff[1] & 0x04 != 0){parity++};
  if (buff[2] & 0x40 != 0){parity++};
  if (buff[2] & 0x04 != 0){parity++};
  if (buff[3] & 0x04 != 0){parity++};
  if (buff[3] & 0x40 != 0){parity++};
  if (buff[4] & 0x04 != 0){parity++};
  if (buff[4] & 0x40 != 0){parity++};
  if (buff[5] & 0x40 != 0){parity++};
  if((parity & 0x01) != 0){
    tools.log("rfxrx",'B2 Parity error');
    return false;
  }  
  
  parity = 0;
  if (buff[1] & 0x80 != 0){parity++};  
  if (buff[1] & 0x08 != 0){parity++};
  if (buff[2] & 0x80 != 0){parity++};
  if (buff[2] & 0x08 != 0){parity++};
  if (buff[3] & 0x08 != 0){parity++};
  if (buff[3] & 0x80 != 0){parity++};
  if (buff[4] & 0x08 != 0){parity++};
  if (buff[4] & 0x80 != 0){parity++};
  if (buff[5] & 0x80 != 0){parity++};
  if((parity & 0x08) != 0){
    tools.log("rfxrx",'B3 Parity error');
    return false;
  }  
  return true; 
}


function reverse(s){
    return s.split("").reverse().join("");
}

function processVisonic(){
  if(visonicCS()){
    addr = (buff[1] << 16) + (buff[2] << 8) + (buff[3]);
    var pad = "000000000000000000000000";
    addr = addr.toString(2);
    addr = pad.substring(0, pad.length - addr.length)+addr;
    addr = parseInt(reverse(addr.toString(2)),2);
    pad = "00000000";
    addr = addr.toString();
    addr = pad.substring(0, pad.length - addr.length)+addr;
    
    tools.newValue(addr+'/tamper',  ((buff[4] & 0x80) != 0?1:0).toString());
    tools.newValue(addr+'/alert',   ((buff[4] & 0x40) != 0?1:0).toString());
    tools.newValue(addr+'/batt',    ((buff[4] & 0x20) != 0?1:0).toString());
    tools.newValue(addr+'/alive',   ((buff[4] & 0x10) != 0?1:0).toString());
    tools.newValue(addr+'/restore', ((buff[4] & 0x08) != 0?1:0).toString());
   
    buff=[];
  }  
}



function oregonCS8(){
  var cs=0;
  cs += ((buff[1] >> 4) & 0x0f) + (buff[1] & 0x0f); 
  cs += ((buff[2] >> 4) & 0x0f) + (buff[2] & 0x0f);
  cs += ((buff[3] >> 4) & 0x0f) + (buff[3] & 0x0f);
  cs += ((buff[4] >> 4) & 0x0f) + (buff[4] & 0x0f);
  cs += ((buff[5] >> 4) & 0x0f) + (buff[5] & 0x0f);
  cs += ((buff[6] >> 4) & 0x0f) + (buff[6] & 0x0f);
  cs += ((buff[7] >> 4) & 0x0f) + (buff[7] & 0x0f);
  cs += ((buff[8] >> 4) & 0x0f) + (buff[8] & 0x0f);
  return cs;
}


function oregonChecksum8(){
  var cs = 0;
  cs = oregonCS8();
  cs = cs - 0x0a;
  cs = cs - buff[9];
  return (cs == 0);
}


function oregonChecksumw(){
  var cs = 0;
  cs += ((buff[1] >> 4) & 0x0f) + (buff[1] & 0x0f);
  cs += ((buff[2] >> 4) & 0x0f) + (buff[2] & 0x0f);
  cs += ((buff[3] >> 4) & 0x0f) + (buff[3] & 0x0f);
  cs += ((buff[4] >> 4) & 0x0f) + (buff[4] & 0x0f);
  cs += ((buff[5] >> 4) & 0x0f) + (buff[5] & 0x0f);
  cs += ((buff[6] >> 4) & 0x0f) + (buff[6] & 0x0f);
  cs += (buff[7] & 0x0f);
  cs = (cs - ((buff[7] >> 4) & 0x0f) + ((buff[8] << 4) & 0xf0)) & 0xff;
  return (cs == 0x0a);
}

function processOregon(){
  var sign = 0;
  var temp = 0;
  var humi = 0;
  var comf = 0;
  var batt = 0;
  if((((buff[1] << 8) + buff[2]) == 0x1a2d) && (recbits == 80) ){
    if(!oregonChecksum8()){
      return false;
    } else {
      addr=buff[4].toString(16).toUpperCase();
      var pad="00";
      addr = addr.toString(16).toUpperCase();
      addr = pad.substring(0, pad.length - addr.length)+addr;
      sign=((buff[7]&0x08)==0)?1:-1;
      temp=sign*((parseInt(buff[6].toString(16)))+((buff[5]>>4)/10));
      humi=((buff[8]&0x0f)<<4)+((buff[7]&0xf0)>>4);
      comf=buff[8]&0xc0;
      batt=((buff[5]&0x04)!=0)?1:0;
      
      tools.newValue(addr+"/temp",temp);
      tools.newValue(addr+"/hum",humi);
      tools.newValue(addr+"/comfort",comf);
      tools.newValue(addr+"/batt",batt);
      buff=[];
      return true;
    }
  } 
  if((((buff[1] << 8) + buff[2]) == 0xea4c) && (recbits == 80) ){
    if(!oregonChecksumw()){
      return false;
    } else {
      addr = buff[4].toString(16).toUpperCase();
      tools.log("rfxrx","!addr="+addr);
      buff=[];
      return true;
    }
  }
  return false;
}
function processKAKU(){ // work in progress  
  addr = (((buff[1] & 0x3f) << 2) + ((buff[2] & 0xc0) >> 6)).toString(16);
  addr += (((buff[2] & 0x3f) << 2) + ((buff[3] & 0xc0) >> 6)).toString(16);
  addr += (((buff[3] & 0x3f) << 2) + ((buff[4] & 0xc0) >> 6)).toString(16);
  //var pad="00";
  //addr = addr.toString(16).toUpperCase();
  //addr = pad.substring(0, pad.length - addr.length)+addr; 
  tools.log("rfxrx", "KAKU="+addr); 
  tools.log("rfxrx", "4x30="+(buff[4]&0x30).toString());
  tools.log("rfxrx", "3x20="+(buff[3]&0x20).toString());
  var uc = buff[4] & 0x0f;
  switch(uc){
  case 10:
    tools.log("rfxrx", "left="+(buff[4]&0x30).toString());
    break;
  case 11:
    tools.log("rfxrx", "rigt="+(buff[4]&0x30).toString());
    break;    
  }
  buff = [];
}

function processX10(){
  tools.log("rfxrx", "processX10()");
  // House Code
  var houseCodes = ["M","N","O","P","C","D","A","B","E","F","G","H","K","L","I","J"];
  hi = (buff[1] & 0xf0) >> 4;
  hc = houseCodes[hi];

  // Unit Code and command
  uc = 0;
  cmd = "";
  switch(buff[3]){
    case 0x80:
      cmd="ALF";
      break;          
    case 0x90:
      cmd="ALN";
      break;
    case 0x88:
      cmd="BGT";
      break;
    case 0x98:
      cmd="DIM";
      break;
    default:
      uc=0;
      if((buff[3] & 0x10)!= 0) {uc+=1};
      if((buff[3] & 0x08)!= 0) {uc+=2};            
      if((buff[3] & 0x40)!= 0) {uc+=4};          
      if((buff[1] & 0x04)!= 0) {uc+=8};
      uc++;
      cmd=(buff[3] & 0x20)==0?"1":"0";
  }
  // Unit Code formatting
  var pad="00";
  uc = uc.toString();
  uc = pad.substring(0, pad.length - uc.length)+uc;
       
  var addr = hc+uc;
  tools.log("rfxrx", "addr="+addr+", cmd="+cmd);
  
  tools.newValue(addr+"/onoff", cmd, true);  // always publish!
  buff = [];
}

function processRFRemote(){  
  //tools.log("rfxrx", "processRFRemote()");
}

function processX10Security(){
  addr = ((buff[1]<<8)+buff[2]).toString(16);
  tools.log("rfxrx", "==========================>processX10Sec.addr="+addr);
  
  // only SD90 supported
  switch(buff[3]){
    case 0x26:
      tools.newValue(addr+"/panic", "1", true);
      break;
    default:
      tools.newValue(addr+"/panic", "0", true);
      alert = ((buff[3]&0x80)==0x00)?"1":"0";
      batt =  ((buff[3]&0x01)==0x01)?"1":"0";      
      tools.newValue(addr+"/alert", alert, true);  // always publish!
      tools.newValue(addr+"/batt", batt); 
  }  
  buff = [];      
}

function processX(){
  if( ((buff[1] ^ buff[2]) == 0xff) && (buff[1] == 0xee)){
    processRFRemote();
  } else {
    if( (buff.length >= 5) && ((buff[1] ^ buff[2]) == 0xff) && ((buff[3] ^ buff[4]) == 0xff)){
      processX10();
    } else {
      if( (buff.length >= 5) && (buff[1] == ((buff[2] & 0xf0) + (0x0f - (buff[2] & 0x0f)))) && ((buff[3] ^ buff[4]) == 0xff) ) {
        processX10Security();
      } else {
        if ( (buff.length > 5) && ((buff[3] ^ buff[4]) == 0xff) ){
          processVisonic();          
        }
      }
    }
  }
}

function logBadPacket(){
  tools.log("rfxrx", "Bad packet!");  
  tools.log("rfxrx", buff.length.toString());    
}
