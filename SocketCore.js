//todo:
//tests
//binary data support

var socketCore = (function (window) {
    "use strict";

    function createCookie(name, value, days) {
        var expires = "";
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + value + expires + "; path=/";
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    function eraseCookie(name) {
        createCookie(name, "", -1);
    }

    function guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }

        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    function prepareUrl(urlOrPath) {
        if (urlOrPath.indexOf("ws://") !== -1) {
            return urlOrPath;
        }

        var url = "ws://" + location.host + urlOrPath;
        return url;
    }



    var connectionState = {
        opening: 0,
        opened: 1,
        reopening: 2,
        closed: 3
    };

    function socketEvent() {
        this.handlers = [];
    }

    socketEvent.prototype = {
        subscribe: function (fn) {
            this.handlers.push(fn);
        },

        unsubscribe: function (fn) {
            this.handlers = this.handlers.filter(
                function (item) {
                    if (item !== fn) {
                        return item;
                    }
                }
            );
        },

        fire: function (o, thisObj) {
            var scope = thisObj || window;
            this.handlers.forEach(function (item) {
                item.call(scope, o);
            });
        }
    }


    function connection(urlOrPath) {
        this.url = prepareUrl(urlOrPath);
        this.webSocket = null;
        this.connectionId = null;
        this.state = null;

        this.openingEvt = new socketEvent();
        this.openedEvt = new socketEvent();
        this.reopeningEvt = new socketEvent();
        this.closedEvt = new socketEvent();
        this.stateChangedEvt = new socketEvent();
        this.recievedEvt = new socketEvent();
        this.sentEvt = new socketEvent();
        this.errorEvt = new socketEvent();
    }

    connection.prototype = {
        opening: function (handler) {
            this.openingEvt.subscribe(handler);
        },

        opened: function (handler) {
            this.openedEvt.subscribe(handler);
        },

        reopening: function (handler) {
            this.reopeningEvt.subscribe(handler);
        },

        closed: function (handler) {
            this.closedEvt.subscribe(handler);
        },

        recieved: function (handler) {
            this.recievedEvt.subscribe(handler);
        },

        sent: function (handler) {
            this.sentEvt.subscribe(handler);
        },

        stateChanged: function (handler) {
            this.stateChangedEvt.subscribe(handler);
        },

        error: function (handler) {
            this.errorEvt.subscribe(handler);
        },

        fireStateChanged: function (newState) {
            var self = this;

            var previousState = self.state;
            self.state = newState;

            self.stateChangedEvt.fire({ current: newState, previous: previousState }, self);

            switch (newState) {
                case connectionState.opening:
                    self.openingEvt.fire(connectionState.opening, self);
                    break;

                case connectionState.opened:
                    self.openedEvt.fire(connectionState.opened, self);
                    break;

                case connectionState.reopening:
                    self.reopeningEvt.fire(connectionState.reopening, self);
                    break;

                case connectionState.closed:
                    self.closedEvt.fire(connectionState.closed, self);
                    break;
            }
        },

        open: function () {
            var self = this;

            self.fireStateChanged(connectionState.opening, self);

            self.webSocket = new WebSocket(this.url);

            self.webSocket.onopen = function (evt) {
            };

            self.webSocket.onmessage = function (evt) {
                var cmd = JSON.parse(evt.data);

                if (cmd.Type === "SetConnectionId") {
                    self.connectionId = cmd.Data;
                    self.fireStateChanged(connectionState.opened);
                }
                else if (cmd.Type === "Data") {
                    self.recievedEvt.fire(cmd.Data, self);
                }
            };

            self.webSocket.onerror = function (evt) {
                self.errorEvt.fire(evt, self);
            };

            self.webSocket.onclose = function (evt) {
                self.fireStateChanged(connectionState.closed);
            };
        },

        send: function (data) {
            var self = this;

            window.onbeforeunload = function () {
                self.webSocket.onclose = function () { }; // disable onclose handler first
                self.webSocket.close()
            };

            if (self.webSocket.readyState === WebSocket.OPEN) {
                var cmd = { Type: "Data", Data: data };
                self.webSocket.send(JSON.stringify(cmd));
                self.sentEvt.fire(data, self);
            }
            else if (self.webSocket.readyState === WebSocket.opening) {
                var handle = setTimeout(function () {
                    clearTimeout(handle);
                    self.send(data);
                }, 100);
            }
            else if (self.webSocket.readyState === WebSocket.CLOSING) {
                self.open();
                self.fireStateChanged(connectionState.reopening);

                var handle = setTimeout(function () {
                    clearTimeout(handle);
                    self.send(data);
                }, 100);
            }
            else if (self.webSocket.readyState === WebSocket.CLOSED) {
                self.open();
                self.fireStateChanged(connectionState.reopening);

                var handle = setTimeout(function () {
                    clearTimeout(handle);
                    self.send(data);
                }, 100);
            }
        },

        close: function (code, reason) {
            this.webSocket.close(code, reason);
        }
    }


    function workflowClient(urlOrPath, options) {
        var self = this;

        options = options || {};

        options.contextHeader = options.contextHeader || function () { return window.location.hash.replace("#", ""); };
        options.contextHeaderEnabled = options.contextHeaderEnabled === undefined ? true : options.contextHeaderEnabled;

        function generateSessionId() {
            var sessionId = readCookie("SocketCore.SessionId");

            if (!sessionId) {
                sessionId = guid();
                createCookie("SocketCore.SessionId", sessionId);
            }

            return sessionId;
        }

        this.connection = new socketCore.connection(urlOrPath);
        this.sessionId = options.sessionId || generateSessionId();
        this.senderId = options.senderId || "WebClient";
        this.handlers = [];
        this.handlersWorkflowsEvents = [];
        this.options = options;

        this.connection.opening(function () {
            //todo: opening message class
            self.dispatchWorkflowsEventsMessage(new socketCore.message("SocketCore.WokrflowEvents", "Opening"), self);
        });

        this.connection.reopening(function () {
            //todo: reopening message class
            self.dispatchWorkflowsEventsMessage(new socketCore.message("SocketCore.WokrflowEvents", "Reopening", this.connection.connectionId), self);
        });

        this.connection.closed(function () {
            //todo: closed message class
            self.dispatchWorkflowsEventsMessage(new socketCore.message("SocketCore.WokrflowEvents", "Closed", this.connection.connectionId), self);
        });

        this.connection.stateChanged(function (state) {
            //todo: stateChanged message class
            self.dispatchWorkflowsEventsMessage(new socketCore.message("SocketCore.WokrflowEvents", "StateChanged", state), self);
        });

        this.connection.recieved(function (data) {
            self.dispatchMessage(data, self);
        });

        this.connection.sent(function (data) {
            //todo: sent message class
            self.dispatchWorkflowsEventsMessage(new socketCore.message("SocketCore.WokrflowEvents", "Sent", data), self);
        });

        this.connection.error(function (evt) {
            //todo: error message class
            self.dispatchWorkflowsEventsMessage(new socketCore.message("SocketCore.WokrflowEvents", "Error", evt), self);
        });
    }

    workflowClient.prototype = {
        run: function (handler) {
            this.connection.opened(handler);
            this.connection.open();
        },

        send: function (channel, message) {
            var options = this.options;

            if (!message.messageId) {
                message.messageId = guid();
            }

            message.connectionId = this.connection.connectionId;
            message.senderId = this.senderId;
            message.sessionId = this.sessionId;

            if (!Array.isArray(message.headers)) {
                message.headers = [];
            }

            if (options.contextHeaderEnabled) {
                message.headers.push({ Name: "Context", Value: options.contextHeader() });
            }

            this.connection.send({
                Channel: channel,
                Message: message
            });
        },

        subscribe: function (fn) {
            this.handlers.push(fn);
        },

        unsubscribe: function (fn) {
            this.handlers = this.handlers.filter(
                function (item) {
                    if (item !== fn) {
                        return item;
                    }
                }
            );
        },

        dispatchMessage: function (data, thisObj) {
            this.handlers.forEach(function (item) {
                var message = new socketCore.message(data.Namespace, data.Type, data.Data, data.Headers); // copy of the message
                item.call(thisObj, message);
            });
        },

        subscribeWorkflowsEventsChannel: function (fn) {
            this.handlersWorkflowsEvents.push(fn);
        },

        unsubscribeWorkflowsEventsChannel: function (fn) {
            this.handlersWorkflowsEvents = this.handlersWorkflowsEvents.filter(
                function (item) {
                    if (item !== fn) {
                        return item;
                    }
                }
            );
        },

        dispatchWorkflowsEventsMessage: function (msg, thisObj) {
            this.handlersWorkflowsEvents.forEach(function (item) {
                var message = msg.clone(); // copy of the message
                item.call(thisObj, message);
            });
        },
    }


    function message(ns, type, data, headers) {
        this.namespace = ns;
        this.type = type;
        this.data = data;
        this.headers = headers || [];

        this.messageId = null;
        this.connectionId = null;
        this.sessionId = null;
        this.senderId = null;
        this.replyToMessageId = null;
    }

    message.prototype = {
        isMatch: function (ns, type) {
            return this.namespace === ns && this.type === type;
        },

        clone: function () {
            return JSON.parse(JSON.stringify(this));
        }
    }


    return {
        connectionState: connectionState,
        connection: connection,
        workflowClient: workflowClient,
        message: message
    };
})(window);