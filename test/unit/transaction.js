/*
  SIPCore.js - General purpose SIP library for JavaScript.
  Copyright (C) 2013 Gregor Mazovec

  SIPCore.js is free software: you can redistribute it and/or modify
  it under the terms of the GNU Lesser General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  SIPCore.js is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public License
  along with SIPCore.js. If not, see <http://www.gnu.org/licenses/>.
*/


if (typeof define !== 'function') { var define = require('amdefine')(module) };

define(function (require, exports) {

var SIP = require('sip');
var protocol = SIP.createProtocol();
var protocolName = protocol.name;
var host = '127.0.0.1';
var portNumber = 5160;


// helpers
function setAsReliable (transport) {

  // mark heap protocol as unreliable
  transport._protocols[protocolName][0].reliable = true;
}


function createInviteMessage (port) {

  var name = protocolName.toUpperCase();

  var msg = SIP.createMessage('INVITE', 'sip:alice@'+ host, {
    'via': 'SIP/2.0/'+ name +' 0.0.0.0:'+ port +';branch=8nb56v44rtb54tg',
    'max-forwards': '70',
    'from': '<sip:bob@example.org>;tag=654b7-'+ new Date().getTime(),
    'to': '<sip:alice@example.org>',
    'call-id': new Date().getTime() + '',
    'contact': '<sip:bob@'+ host + ':' + port + '>;transport='+ protocolName,
    'cseq': '1 INVITE'
  });

  return msg;
}


function createRegisterMessage (port) {

  var name = protocolName.toUpperCase();

  var msg = SIP.createMessage('REGISTER', 'sip:'+ host, {
    'via': 'SIP/2.0/'+ name +' 0.0.0.0:'+ port +';branch=8nb56v44rtb54tg',
    'max-forwards': '70',
    'from': '<sip:bob@example.org>;tag=654b7-'+ new Date().getTime(),
    'to': '<sip:bob@example.org>',
    'call-id': new Date().getTime() + '',
    'contact': '<sip:bob@'+ host + ':' + port + '>;transport='+ protocolName,
    'cseq': '1 REGISTER'
  });

  return msg;
}


// patch SIP.Transport
(function () {

  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, portNumber);

  transport.__proto__.pushHeapMessage = function (msg) {
  
    var heap = this._protocols.heap[0];

    if (heap) {
      heap.__push(msg.format());
    }
  };

})();


// Message module
QUnit.module('Transaction');


test('API functions', 2, function () {

  var transport = SIP.createTransport();
  var transaction = SIP.createTransaction(transport);

  ok(SIP.createTransaction, 'Function createTransaction is defined');
  ok(transaction.send, 'Function Transaction.send is defined');
});


asyncTest('Client transaction - send error', 1, function () {

  var port = portNumber++;
  var transport = SIP.createTransport();

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trC = SIP.createTransaction(transport);

    trC.on('error', function () {

      ok(true, 'Transport error caught.');
      start();
    });

    trC.send(msg, host, 5060, protocolName);

   });
});


asyncTest('Client transaction - resending request', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {
    
      ok(!err, 'Initial request sent.');

      trC.send(msg, host, 5060, protocolName, function (err) {
      
        ok(err, 'Request re-sending blocked.');
        start();
      });
    });

   });
});


asyncTest('Server transaction - sending responses', 1, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trS = SIP.createTransaction(transport, msg);


    trS.on('message', function (msg) {

      trS.send(msg.toResponse(100));
      trS.send(msg.toResponse(180));
      trS.send(msg.toResponse(200));
      
      trS.send(msg.toResponse(200), function (err) {
      
        ok(err, 'Request re-sending blocked.');
        start();
      });

    });

    transport.pushHeapMessage(msg);

   });
});


asyncTest('Client transaction - non-invite state machine, REGISTER/200', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 2, 'Transaction state set to trying.');

      transport.pushHeapMessage(msg.toResponse(200));
    });

    trC.once('message', function (msg) {

      equal(trC.state, 4, 'Transaction state set to completed.');

      trC.once('state', function (state) {
        
        equal(trC.state, 6, 'Transaction state set to terminated.');
        start();
      });
    });

  });

});


asyncTest('Client transaction - non-invite state machine, REGISTER/100/403', 4, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 2, 'Transaction state set to trying.');

      transport.pushHeapMessage(msg.toResponse(100));
    });

    trC.once('message', function (msgR) {

      equal(trC.state, 3, 'Transaction state set to proceeding.');

      transport.pushHeapMessage(msg.toResponse(404));

      trC.once('message', function (msgR) {

        equal(trC.state, 4, 'Transaction state set to completed.');

        trC.once('state', function (state) {
          
          equal(trC.state, 6, 'Transaction state set to terminated.');
          start();
        });
      });

    });

  });

});


asyncTest('Server transaction - non-invite state machine, REGISTER/200', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 2, 'Transaction state set to trying.');

      trS.once('state', function (state) {

        equal(trS.state, 4, 'Transaction state set to completed.');

        trS.once('state', function (state) {

          equal(trS.state, 6, 'Transaction state set to terminated.');
          start();
        });
      });
      
      trS.send(msg.toResponse(200));

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - non-invite state machine, REGISTER/100/403', 4, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 2, 'Transaction state set to trying.');

      trS.once('state', function (state) {

        equal(trS.state, 3, 'Transaction state set to proceeding.');

        trS.once('state', function (state) {

          equal(trS.state, 4, 'Transaction state set to completed.');

          trS.once('state', function (state) {

            equal(trS.state, 6, 'Transaction state set to terminated.');
            start();
          });
        });

        trS.send(msg.toResponse(403));
      });
      
      trS.send(msg.toResponse(100));

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Client transaction - invite state machine, INVITE/200', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 1, 'Transaction state set to calling.');

      transport.pushHeapMessage(msg.toResponse(200));
    });

    trC.once('message', function (msgR) {

      equal(trC.state, 6, 'Transaction state set to terminated.');
      start();
    });

  });

});


asyncTest('Client transaction - invite state machine, INVITE/404', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 1, 'Transaction state set to calling.');

      transport.pushHeapMessage(msg.toResponse(404));
    });

    trC.once('message', function (msgR) {

      equal(trC.state, 4, 'Transaction state set to completed.');

      trC.once('state', function (state) {

        equal(trC.state, 6, 'Transaction state set to terminated.');
        start();
      });
    });

  });

});


asyncTest('Client transaction - invite state machine, INVITE/100/404', 4, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 1, 'Transaction state set to calling.');

      transport.pushHeapMessage(msg.toResponse(100));
    });

    trC.once('message', function (msgR) {

      equal(trC.state, 3, 'Transaction state set to proceeding.');

      trC.once('message', function (msgR) {

        equal(trC.state, 4, 'Transaction state set to completed.');

        trC.once('state', function (state) {

          equal(trC.state, 6, 'Transaction state set to terminated.');
          start();
        });
      });

      transport.pushHeapMessage(msg.toResponse(404));
    });

  });

});


asyncTest('Client transaction - invite, INVITE/100/404/ACK', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {
      transport.pushHeapMessage(msg.toResponse(100));
    });

    trC.once('message', function (msgR) {

      transport.once('send', function (msgACK) {
        equal(msgACK.method, 'ACK', 'ACK request sent by client transaction.');
      });

      trC.once('state', function () {

        equal(trC.state, 4, 'Transaction state set to completed.');

        trC.once('state', function (state) {

          equal(trC.state, 6, 'Transaction state set to terminated.');
          start();
        });

      });

      transport.pushHeapMessage(msg.toResponse(404));
    });

  });

});


asyncTest('Client transaction - invite state machine, INVITE/100/180/200', 4, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 1, 'Transaction state set to calling.');

      transport.pushHeapMessage(msg.toResponse(100));
    });

    trC.once('message', function (msgR) {

      equal(trC.state, 3, 'Transaction state set to proceeding.');

      trC.once('message', function (msgR) {

        equal(trC.state, 3, 'Transaction state set to proceeding.');
      });

      trC.once('state', function (state) {

        equal(trC.state, 6, 'Transaction state set to terminated.');
        start();
      });

      transport.pushHeapMessage(msg.toResponse(180));

      setTimeout(function () {
        transport.pushHeapMessage(msg.toResponse(200));
      }, 0);
    });

  });

});


asyncTest('Client transaction - transport error', 2, function () {

  var port = portNumber++;
  var transport = SIP.createTransport();

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.on('error', function (err) {

      equal(trC.state, 6, 'Transaction state set to calling.');
      start();
    });

    trC.send(msg, host, 5060, protocolName, function (err) {
      ok(err, 'Error occured.');
    });

  });

});


asyncTest('Server transaction - invite state machine, INVITE/200', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);
  
  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 3, 'Transaction state set to proceeding.');

      trS.once('state', function (state) {

        equal(trS.state, 6, 'Transaction state set to terminated.');
        start();
      });
      
      trS.send(msg.toResponse(200));

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - invite state machine, INVITE/100/404', 4, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 3, 'Transaction state set to proceeding.');

      trS.once('state', function (state) {

        equal(trS.state, 4, 'Transaction state set to completed.');

        trS.once('state', function (state) {
          equal(trS.state, 5, 'Transaction state set to confirmed.');

          trS.once('state', function (state) {
            equal(trS.state, 6, 'Transaction state set to terminated.');
            start();
          });
        });

        transport.pushHeapMessage(msg.toResponse(404).toRequest('ACK', msg.uri));
      });

      
      trS.send(msg.toResponse(100));

      setTimeout(function () {
        trS.send(msg.toResponse(404));
      });

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - invite state machine, INVITE/100/180/200', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 3, 'Transaction state set to proceeding.');

      trS.once('state', function (state) {

        equal(trS.state, 6, 'Transaction state set to terminated.');
        start();
      });

      
      trS.send(msg.toResponse(100));

      setTimeout(function () {

        trS.send(msg.toResponse(180));

        setTimeout(function () {
          trS.send(msg.toResponse(200));
        });
      });

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - sent 100 response', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  setAsReliable(transport);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 3, 'Transaction state set to proceeding.');

      transport.once('send', function (msgR) {
        
        equal(msgR.status, 100, '100 Trying response sent by transaction layer.');

        trS.once('state', function (state) {

          if (state == 6) {
            equal(trS.state, 6, 'Transaction state set to terminated.');
            start();
          }
        });

        trS.send(msg.toResponse(200));
      });

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - invite, response retransmission', 4, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      transport.once('send', function (msgR) {
        
        equal(msgR.status, 100, '100 Trying response sent by transaction layer.');

        transport.once('send', function (msgR) {

          equal(msgR.status, 100, '100 Trying retransmission sent.');


          trS.once('state', function (state) {

            transport.once('send', function (msgR) {
              equal(msgR.status, 404, '404 Not Found retransmission sent.');

              transport.pushHeapMessage(msgR.toRequest('ACK', msg.uri));
            });

            // INVITE request retransmission
            transport.pushHeapMessage(msg);

            trS.on('state', function (state) {

              if (state == 6) {
                equal(trS.state, 6, 'Transaction state set to terminated.');
                start();
              }
            });
          });

          // skip timer I
          setAsReliable(transport);
          trS._isReliable = true;

          trS.send(msg.toResponse(404));
        });

        // INVITE request retransmission
        transport.pushHeapMessage(msg);

      });

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - non-invite, response retransmission', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      transport.once('send', function (msgR) {
        
        transport.once('send', function (msgR) {

          equal(msgR.status, 100, '100 Trying retransmission sent.');

          trS.once('state', function (state) {

            transport.once('send', function (msgR) {
              equal(msgR.status, 404, '404 Not Found retransmission sent.');

              transport.pushHeapMessage(msgR.toRequest('ACK', msg.uri));
            });

            // REGISTER request retransmission
            transport.pushHeapMessage(msg);

            trS.on('state', function (state) {

              if (state == 6) {
                equal(trS.state, 6, 'Transaction state set to terminated.');
                start();
              }
            });
          });

          // skip timer J
          setAsReliable(transport);
          trS._isReliable = true;

          trS.send(msg.toResponse(404));
        });

        // REGISTER request retransmission
        transport.pushHeapMessage(msg);

      });

      trS.send(msg.toResponse(100));

    });

    transport.pushHeapMessage(msg);

  });

});


// Transaction timeouts
QUnit.module('Transaction timeouts');


asyncTest('Client transaction - invite timeout B', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {
      equal(trC.state, 1, 'Transaction state set to calling.');
    });
    
    trC.once('timeout', function () {

      equal(trC.state, 6, 'Transaction state set to terminated.');
      start();
    });

  });

});


asyncTest('Client transaction - non-invite timeout F', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {
      equal(trC.state, 2, 'Transaction state set to trying.');
    });
    
    trC.once('timeout', function () {

      equal(trC.state, 6, 'Transaction state set to terminated.');
      start();
    });

  });

});


asyncTest('Client transaction - non-invite timeout F in proceeding state', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      equal(trC.state, 2, 'Transaction state set to trying.');
      transport.pushHeapMessage(msg.toResponse(100));
    });

    trC.once('message', function (msgR) {
      equal(trC.state, 3, 'Transaction state set to proceeding.');
    })
    
    trC.once('timeout', function () {

      equal(trC.state, 6, 'Transaction state set to terminated.');
      start();
    });

  });

});


asyncTest('Server transaction - invite timeout H, INVITE/100/404', 3, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      equal(trS.state, 3, 'Transaction state set to proceeding.');

      trS.once('state', function (state) {

        equal(trS.state, 4, 'Transaction state set to completed.');

        trS.once('timeout', function (state) {

          equal(trS.state, 6, 'Transaction state set to terminated.');
          start();
        });
      });

      
      trS.send(msg.toResponse(100));

      setTimeout(function () {
        trS.send(msg.toResponse(404));
      });

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Client transaction - invite timeout A', 7, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {

      transport.on('send', function (msgRe) {
        equal(trC.state, 1, 'Transaction state set to calling.');
      });
    });
    
    trC.once('timeout', function () {

      equal(trC.state, 6, 'Transaction state set to terminated.');
      start();
    });

  });

});


asyncTest('Client transaction - invite timer D, unreliable transport', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var trC = SIP.createTransaction(transport);

    trC.send(msg, host, 5060, protocolName, function (err) {
      transport.pushHeapMessage(msg.toResponse(100));
    });

    trC.once('message', function (msgR) {

      trC.once('state', function (msgR) {

        var timerTs = new Date().getTime();

        trC.once('state', function (state) {
 
          var timerEndTs = new Date().getTime();

          ok(timerEndTs - timerTs > 30000, 'Timer D fired after more than 30 seconds.');
          equal(trC.state, 6, 'Transaction state set to terminated.');
          start();
        });
      });

      transport.pushHeapMessage(msg.toResponse(404));
    });

  });

});


asyncTest('Client transaction - timer E/K, unreliable transport, REGISTER/100/200', 6, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trC = SIP.createTransaction(transport);
    var retry = 4;

    trC.send(msg, host, 5060, protocolName, function (err) {

      transport.on('send', function (msgRe) {

        if (--retry == 0) {    

          transport.pushHeapMessage(msg.toResponse(100));

          trC.once('state', function (state) {

            equal(trC.state, 3, 'Transaction state set to proceeding.');

            var timeoutTs = new Date().getTime();

            trC.on('state', function (state) {

              if (state == 6) {

                var timeoutEndTs = new Date().getTime();

                ok(true, 'Transaction state set to terminated.');
                ok(timeoutEndTs - timeoutTs > 4500, 'Timer K fired after 5 seconds.');
                start();
              }
              else if (state == 4) {
                
                timeoutTs = new Date().getTime();
              }

            });

            transport.pushHeapMessage(msg.toResponse(200));
          });

        }
        else if (retry > 0) {

          equal(trC.state, 2, 'Transaction state set to trying.');
        }
      });

    });
  });

});


asyncTest('Client transaction - timer E/K, unreliable transport, REGISTER/403', 5, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage();
    var trC = SIP.createTransaction(transport);
    var retry = 4;

    trC.send(msg, host, 5060, protocolName, function (err) {

      transport.on('send', function (msgRe) {

        if (--retry == 0) {    

          trC.once('state', function (state) {

            var timeoutTs = new Date().getTime();

            trC.on('state', function (state) {

              if (state == 6) {

                var timeoutEndTs = new Date().getTime();

                ok(true, 'Transaction state set to terminated.');
                ok(timeoutEndTs - timeoutTs > 4500, 'Timer K fired after 5 seconds.');
                start();
              }
              else if (state == 4) {
                
                timeoutTs = new Date().getTime();
              }

            });
          });

          transport.pushHeapMessage(msg.toResponse(403));
        }
        else if (retry > 0) {

          equal(trC.state, 2, 'Transaction state set to trying.');
        }
      });

    });
  });

});


asyncTest('Server transaction - timer G/I, INVITE/100/404', 6, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createInviteMessage(port);
    var retry = 4;

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      trS.once('state', function (state) {

          if (trS.state != 4) return;

        setTimeout(function () {

          transport.on('send', function (msgRe) {

            if (--retry == 0) {

              trS.once('state', function (state) {
                equal(trS.state, 5, 'Transaction state set to confirmed.');

                var timeoutTs = new Date().getTime();

                trS.once('state', function (state) {

                  var timeoutEndTs = new Date().getTime();

                  ok(timeoutEndTs - timeoutTs > 4500, 'Timer I fired after 5 seconds.');
                  equal(trS.state, 6, 'Transaction state set to terminated.');
                  start();
                });
              });

              transport.pushHeapMessage(msg.toResponse(404).toRequest('ACK', msg.uri));
            }
            else {
              
              equal(trS.state, 4, 'Transaction state set to completed.');
            }
          });
        });

      });

      
      trS.send(msg.toResponse(100));

      setTimeout(function () {
        trS.send(msg.toResponse(404));
      });

    });

    transport.pushHeapMessage(msg);

  });

});


asyncTest('Server transaction - timer J, unreliable transport, REGISTER/100/403', 2, function () {

  var port = portNumber++;
  var protocol = SIP.createProtocol();
  var transport = SIP.createTransport();

  transport.register(protocol, port);

  transport.listen(function (listenState) {

    var msg = createRegisterMessage(port);

    transport.once('message', function (msg) {

      var trS = SIP.createTransaction(transport, msg);

      trS.once('state', function (state) {

        trS.once('state', function (state) {

          var timeoutTs = new Date().getTime();

          trS.once('state', function (state) {

            var timeoutEndTs = new Date().getTime();

            ok(timeoutEndTs - timeoutTs > 30000, 'Timer J fired after more than 30 seconds.');
            equal(trS.state, 6, 'Transaction state set to terminated.');
            start();
          });
        });

        trS.send(msg.toResponse(403));
      });
      
      trS.send(msg.toResponse(100));

    });

    transport.pushHeapMessage(msg);

  });

});

});
