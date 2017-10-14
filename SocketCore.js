//todo:
//tests
//binary data support

var socketCore = (function (window) {
    "use strict";

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


    function prepareUrl(urlOrPath) {
        if (urlOrPath.indexOf("ws://") !== -1) {
            return urlOrPath;
        }

        var url = "ws://" + location.host + urlOrPath;
        return url;
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
                var message = JSON.parse(evt.data);

                if (message.Type === "SetConnectionId") {
                    self.connectionId = message.Data;
                    self.fireStateChanged(connectionState.opened);
                }
                else if (message.Type === "Data") {
                    self.recievedEvt.fire(message.Data, self);
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
                var message = { Type: "Data", Data: data };
                self.webSocket.send(JSON.stringify(message));
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


    return {
        connectionState: connectionState,
        connection: connection
    };
})(window);