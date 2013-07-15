var net = require('net');
var mqtt = require('mqtt');
var tools = require("./tools");
var events = require('events');
var util = require('util');

var PORT = 1234;
var HOST='192.168.10.3';
var USERCODE=0xd2;
var HOUSECODES=["B"];
var STX = 0x02;
var ETX = 0x03;

var PLCBUSCOMMANDS = [
    "ALL_UNITS_OFF",            //   0x00
    "ALL_LIGHTS_ON",            //   0x01
    "ON",                       //   0x02
    "OFF",                      //   0x03
    "DIM",                      //   0x04
    "BRIGHT",                   //   0x05
    "ALL_LIGHTS_OFF",           //   0x06
    "ALL_USER_LIGHTS_ON",       //   0x07
    "ALL_USER_UNITS_OFF",       //   0x08
    "ALL_USER_LIGHTS_OFF",      //   0x09
    "BLINK",                    //   0x0a
    "FADE_STOP",                //   0x0b
    "PRESET_DIM",               //   0x0c
    "STATUS_ON",                //   0x0d
    "STATUS_OFF",               //   0x0e
    "STATUS_REQUEST",           //   0x0f
    "RX_MASTER_ADDR_SETUP",     //   0x10
    "TX_MASTER_ADDR_SETUP",     //   0x11
    "SCENE_ADDR_SETUP",         //   0x12
    "SCENE_ADDR_ERASE",         //   0x13
    "ALL_SCENES_ADDR_ERASE",    //   0x14
    "",                         //   0x15
    "",                         //   0x16
    "",                         //   0x17
    "GET_SIGNAL_STRENGTH",      //   0x18
    "GET_NOISE_STRENGTH",       //   0x19
    "REPORT_SIGNAL_STRENGTH",   //   0x1a
    "REPORT_NOISE_STRENGTH",    //   0x1b
    "GET_ALL_ID_PULSE",         //   0x1c
    "GET_ON_ID_PULSE",          //   0x1d
    "REPORT_ALL_ID_PULSE",      //   0x1e
    "REPORT_ON_ID_PULSE"];      //   0x1f

var ALL_UNITS_OFF             =   0x00;
var ALL_LIGHTS_ON             =   0x01;
var ON                        =   0x02;
var OFF                       =   0x03;
var DIM                       =   0x04;
var BRIGHT                    =   0x05;
var ALL_LIGHTS_OFF            =   0x06;
var ALL_USER_LIGHTS_ON        =   0x07;
var ALL_USER_UNITS_OFF        =   0x08;
var ALL_USER_LIGHTS_OFF       =   0x09;
var BLINK                     =   0x0a;
var FADE_STOP                 =   0x0b;
var PRESET_DIM                =   0x0c;
var STATUS_ON                 =   0x0d;
var STATUS_OFF                =   0x0e;
var STATUS_REQUEST            =   0x0f;
var RX_MASTER_ADDR_SETUP      =   0x10;
var TX_MASTER_ADDR_SETUP      =   0x11;
var SCENE_ADDR_SETUP          =   0x12;
var SCENE_ADDR_ERASE          =   0x13;
var ALL_SCENES_ADDR_ERASE     =   0x14;
var GET_SIGNAL_STRENGTH       =   0x18;
var GET_NOISE_STRENGTH        =   0x19;
var REPORT_SIGNAL_STRENGTH    =   0x1a;
var REPORT_NOISE_STRENGTH     =   0x1b;
var GET_ALL_ID_PULSE          =   0x1c;
var GET_ON_ID_PULSE           =   0x1d;
var REPORT_ALL_ID_PULSE       =   0x1e;
var REPORT_ON_ID_PULSE        =   0x1f;




var queryQueue = [];
var commandQueue = [];
var timeoutId;
var toCount=0;
var buff = [];


Eventer = function(){
  events.EventEmitter.call(this);
  this.iofinished = function(){
    this.emit('iofinished');
  }
};
util.inherits(Eventer, events.EventEmitter);

Listener = function(){
  this.iofinishedHandler =  function(){
    console.log('#####################');
    processQueues();
  }
};

var eventer = new Eventer();
var listener = new Listener(eventer);
eventer.on('iofinished', listener.iofinishedHandler);


tools.createMQTTClient(function(){
  tools.mqttSubscribe('command/plcbus', function(topic, payload){
    console.log("MQTT < "+topic+"="+payload);
    //enQueueCommand(payload);
    commandQueue.push(payload);
    processQueues();
  });
  //setTimeout(enQueueQueries(),10000);
});

// create socket
var client = new net.Socket();

client.setNoDelay(true);
client.connect(PORT, HOST, function() {
  console.log("connected to PLCBUS interface");
  enQueueQueries();
});

client.on('data', function(data) {
  console.log("< "+data.toString("hex"));
  while(data.length > 0){
    buff.push(data[0]);
    data = data.slice(1);
  }
  processData();
});

client.on('close', function() {
  console.log("Connection closed");
});
    
// queue management    
function enQueueQueries(){
  var d = new Date();
  var time = d.toLocaleTimeString();
  console.log(time+' enQueueQueries()');
  for(i=0; i<HOUSECODES.length;i++){
    hc = HOUSECODES[i];
    console.log('Queueing Query '+hc);
    queryQueue.push("{address:'"+hc+"',command:'GET_ON_ID_PULSE'}");
  }
  setTimeout(processQueues(), 2000);
}

function processQueues(){
  console.log('processQueues()');
  if (commandQueue.length > 0){
    var cmd = commandQueue[0];
    console.log(cmd);
    commandQueue.splice(0,1);
    processCommand(cmd);
  } else {
    if (queryQueue.length > 0){
      var cmd = queryQueue[0];
      console.log(cmd);
      queryQueue.splice(0,1);
      processCommand(cmd);      
    } else {
      console.log(queryQueue.length.toString()+' enQueueing in 10 sec.');
      setTimeout(function(){enQueueQueries()}, 10000);
    }
  }
}


function startWithSTX(skip){
  stxix = buff.indexOf(STX, skip);  
  //console.log("stxix="+stxix.toString());
  if(stxix >= 0){
    buff = buff.slice(stxix);  
  } else {
    buff = [];
    return;
  }
}


var txdata = [];
var txbuff;

function processCommand(cmnd){

  var params = eval('('+cmnd+')');
  
  //console.log("addr="+params.address);
  //console.log("cmnd="+params.command);
  
  var plcbus_data1 = 0x0;
  var plcbus_data2 = 0x0;
  var result=0;

  hc = (params.address[0].charCodeAt(0)-65) << 4;
  if(params.address.length > 1){
    uc = parseInt(params.address.substring(1,3))-1;
  } else {
    uc = 0;
  }
  
  //console.log("hc="+hc.toString());
  
  //uc = parseInt(params.address.substring(1,3)) - 1;
  //console.log("uc="+uc);
  hu = hc + uc;
  //console.log("hu="+hu.toString(16));
  
  ci = PLCBUSCOMMANDS.indexOf(params.command);                
  if(ci>=0){
    switch(ci){    
      case 0x00,0x01,0x06,0x07,0x08,0x09,0x1c,0x1d,0x1e,0x1f:      
        hu=hu&0xf0;  // no unit code
        break;
    }
    txdata = [];
    //txdata+=(STX).toString(16);
    //console.log("tx="+txdata);
    
    txdata.push(STX);
    txdata.push(0x05);
    txdata.push(USERCODE);
    txdata.push(hu);
    if(!((ci==0x1c)|(ci==0x1d))){
      ci+=0x20;
    }
    txdata.push(ci);        
    if(params.data1){
      txdata.push(params.data1);
    } else {
      txdata.push(0x00);
    }
    if(params.data2){
      txdata.push(params.data2);
    } else {
      txdata.push(0x00);
    }
    txdata.push(ETX);                   
    console.log("> "+txdata.toString("hex"));
    s = new Buffer(txdata, 'hex');
    //console.log("> "+s);   

    txbuff = new Buffer(txdata, 'hex');
    cmdInProgress=true;
    client.write(txbuff);
  }
}

function processData(){
  // 0 1 2 3 4 5 6 7 8 
  //0206d2ac2264000c03
  //0206d2ac2264000c03
  while(buff.length >= 9){  
    
    // always start with first occurence of STX
    startWithSTX(0);
    if(buff.length == 0) return;
    
    processed = false;
    if(buff.length>=9){
      if(buff[2]==USERCODE){
        if(buff[8]==ETX){       
          len = buff[1];
          usrcode = buff[2];
          hc = String.fromCharCode(65+(buff[3] >> 4));
          uc = 1+(buff[3] & 0x0f);
          var pad = "00";
          uc = uc.toString();
          uc = pad.substring(0, pad.length - uc.length)+uc;
          cmd = buff[4] & 0x1f;
          ack = buff[7] & 0x20;
          data1 = buff[5];
          data2 = buff[6];
                    
          caddr = usrcode.toString(16).toUpperCase()+hc+uc;
          console.log(caddr+" "+PLCBUSCOMMANDS[cmd]+", ACK="+ack.toString(16)+", D1="+data1.toString(16)+", D2="+data2.toString(16));
         
          //console.log("Usercode   ="+usrcode.toString(16));
          //console.log("House code ="+hc);
          //console.log("Unit code  ="+uc);
          //console.log("Buff4      ="+buff[4].toString(16));
          //console.log("Command    ="+cmd.toString(16)+":"+PLCBUSCOMMANDS[cmd]);
          //console.log("Buff7      ="+buff[7].toString(16));        
          //console.log("ACK        ="+ack.toString(16));
        
          switch(cmd) {
            case GET_ALL_ID_PULSE:
              if(buff[7] == 0x40){
                reportMessage();
              }        
              break;
            case GET_ON_ID_PULSE:
              if(buff[7] == 0x40){
                //reportMessage();
                data12 = (buff[5]<<8)+buff[6];
                txt="";
                for(i=0;i<16;i++){
                  onoff=(data12 & (1 << i))!== 0?"ON":"OFF";
                  var pad = "00";
                  uci = (i+1).toString();
                  uci = pad.substring(0, pad.length - uci.length)+uci;
                  caddri = usrcode.toString(16).toUpperCase()+hc+uci;
                  tools.newValue("_"+caddri+"/on", onoff);
                  //console.log(caddri+"="+onoff);
                  txt+=onoff;
                }
                //console.log(txt);
                reportMessage();
              }        
              break;
            case STATUS_REQUEST:
              if(buff[7] == 0x0c){
                reportMessage();
              }        
              break;
            case GET_SIGNAL_STRENGTH:
              if(buff[7] == 0x0c){
                reportMessage();
              }        
              break;
            case REPORT_NOISE_STRENGTH:
              if(buff[7] == 0x0c){
              reportMessage();
              }        
              break;
            default:
              //console.log(buff[7].toString());
              if((buff[7] & 0x20) == 0x20){
                tools.newValue("_"+caddr+"/on", PLCBUSCOMMANDS[cmd]);
                reportMessage();
              }
          }
          buff = buff.slice(len+3);
          processed = true;
        } else console.log("!etx");
      } else console.log("!usercode:"+buff[2].toString(16));
    } else {
      console.log("!buflen:"+buff.length.toString());
      // keep buffer intact, wait for more data
      return;
    }
    
    if(!processed){
      // start from next occurrence of STX
      startWithSTX(1);  
    } 
  }
}

function reportMessage(){

  console.log("'################ IO finished!");
  eventer.iofinished();

  //console.log("This one will be reported...");
  //eventer.iofinished();
  //console.log("This one will be reported...");
  //setTimeout(processQueues, 2000);
}


                                  
//setInterval(function(){processQueues();}, 10000);
