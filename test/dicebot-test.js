'use strict';

var config = require('../app/config');
var should = require('chai').should();
var expect = require('chai').expect;
var app = require('../dbotindex.js');
var supertest = require('supertest');
var api = supertest(app);
var express = require('express')();
var bodyParser = require('body-parser');

//var hellobot = require('../app/hellobot');
var dicebot = require('../app/dicebot');

var http = require('http');
http.globalAgent.maxSockets = 20;

/* Monkey patch express to support removal of routes */
function unmount(routeToRemove) {
	var routes = express._router.stack;
	routes.forEach(removeMiddlewares);
	function removeMiddlewares(route, i, routes) {
	    if (route.path === routeToRemove) {
	    	routes.splice(i, 1);
	    }
	    if (route.route) {
	        route.route.stack.forEach(removeMiddlewares);
	    }
	}
}

describe('App Root', function () {
	it('should say Hello World', function (done) {
		api.get('/')
			.set('Accept', 'application/json')
			.expect(200)
			.end(function(err, res) {
				expect(res.text).to.equal('Hello world!');
				done();
			});
	});
	
});

describe('Hellobot', function () {
	it('should greet the user by name', function (done) {
		api.post('/hello')
			.send('user_name=Mike&token=' + config.TOKEN)
			.set('Accept', 'application/json')
			.expect(200)
			.end(function(err, res) {
				expect(res.body.text).to.equal('Hello, Mike!');
				done();
			});
	});
	it('should do nothing when the name is "slackbot"', function (done) {
		api.post('/hello')
			.send('user_name=slackbot&token=' + config.TOKEN)
			.set('Accept', 'application/json')
			.expect(200)
			.end(function(err, res) {
				expect(res.body.text).to.be.equal(undefined);
				done();
			});
	});
});

describe('Dicebot', function () {
	var server;
	var expectedResults = {
			username: 'dicebot',
			channel: '999',
			icon_emoji: ':game_die:'
		};
	function apimock(req, res, done) {
		req.should.not.be.equal(undefined);
		expect(req.body.username).to.be.equal(expectedResults.username);
		expect(req.body.channel).to.be.equal(expectedResults.channel);
		expect(req.body.icon_emoji).to.be.equal(expectedResults.icon_emoji);
		if (expectedResults.matchDie) {
			expect(req.body.text.match(/\*(\d+)\*/)[1] * 1).to.be.equal(expectedResults.matchDie);
		}
		if (expectedResults.betweenOrEqNums) {
			expect(req.body.text.match(/\*(\d+)\*/)[1] * 1).to.be.least(expectedResults.betweenOrEqNums[0]);
			expect(req.body.text.match(/\*(\d+)\*/)[1] * 1).to.be.most(expectedResults.betweenOrEqNums[1]);
		}
		if (expectedResults.text) {
			expect(req.body.text).to.contain(expectedResults.text);
		}
		done();
	}
	function sendRequest(data) {
		api.post('/roll')
			.send(data.replace(/\+/g, '%2B').replace(/\ /g, '%20') + '&token=' + config.TOKEN)
			.set('Accept', 'application/json')
			.expect(200)
			.end(function(err, res) {
				res.should.not.be.equal(undefined);
			});
	}
	beforeEach(function() {
		dicebot.mockAPIPath('/apimock', 'http://localhost:4567');
		delete expectedResults.text;
		delete expectedResults.matchDie;
		delete expectedResults.betweenOrEqNums;
		// body parser middleware
		express.use(bodyParser.json());
		server = express.listen(4567);
	});
	afterEach(function() {
		unmount('/apimock');
		server.close();
	});
	it('should get a 400 if it it is a POST request with no data', function (done) {
		express.post('/apimock', function(req, res) { done(); } );
		api.post('/roll')
			.expect(400, done);
	});
	it('should get a 404 if it it is a GET request', function (done) {
		api.get('/roll')
			.expect(404, done);
	});
	it('should show the result of a 1d20 roll if nothing is passed', function (done) {
		expectedResults.text = 'Mike rolled 1d20';
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999');
	});
	it('should default to one die when an initial number is not passed (d6)', function (done) {
		expectedResults.text = 'Mike rolled 1d6';
		expectedResults.betweenOrEqNums = [1,6];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=d6');
	});
	it('should show the result of a 2d6 roll', function (done) {
		expectedResults.text = 'Mike rolled 2d6';
		expectedResults.betweenOrEqNums = [2,12];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d6');
	});
	it('should show the result of a 2d8 roll with +5 modifier', function (done) {
		expectedResults.text = 'Mike rolled 2d8 +5';
		expectedResults.betweenOrEqNums = [7,21];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d8 +5');
	});
	it('should show the result of a 2d8 roll with -5 modifier', function (done) {
		expectedResults.text = 'Mike rolled 2d8 -5';
		expectedResults.betweenOrEqNums = [-3,11];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d8 -5');
	});
	it('should show the result of a 2d6 +2d8 roll', function (done) {
		expectedResults.text = 'Mike rolled 2d6 +2d8';
		expectedResults.betweenOrEqNums = [4,28];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d6 2d8');
	});
	it('should show the result of a 2d10 roll with multiple modifiers (+5 +4 +6)', function (done) {
		expectedResults.text = 'Mike rolled 2d10 +15';
		expectedResults.betweenOrEqNums = [17,35];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d10 +5 +4 +6');
	});
	it('should show the result of a 2d6 +2d8 roll with multiple modifiers (+2 +5 +3) ', function (done) {
		expectedResults.text = 'Mike rolled 2d6 +2d8 +10';
		expectedResults.betweenOrEqNums = [14,38];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d6 2d8 +2 +5 +3');
	});
	it('should show be able to handle messy inputs like "+2d6+2d8  +2   +5 + 3") ', function (done) {
		expectedResults.text = 'Mike rolled 2d6 +2d8 +10';
		expectedResults.betweenOrEqNums = [14,38];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d6 +2d8  +2   +5 + 3');
	});
	it('should show be able to handle backwards inputs like "  +2   +5 + 3 +2d6+2d8") ', function (done) {
		expectedResults.text = 'Mike rolled 2d6 +2d8 +10';
		expectedResults.betweenOrEqNums = [14,38];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=2d6 +2d8  +2   +5 + 3');
	});
	it('should crit for a die if the `--cheat` flag is passed: "1d20 --cheat"', function (done) {
		expectedResults.matchDie = 20;
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=1d20 --cheat');
	});
	it('should display a custom "cheated" message if the `--cheat` flag is passed: "1d20 --cheat"', function (done) {
		expectedResults.text = 'hint, they cheated';
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=1d20 --cheat');
	});
	it('should crit for each die if the `--cheat` flag is passed: "4d6 2d8 --cheat"', function (done) {
		expectedResults.matchDie = 40;
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=4d6 2d8 --cheat');
	});
	it('should be in the top 25% for a die if the `--weighted` flag is passed: "1d20 --weighted"', function (done) {
		expectedResults.betweenOrEqNums = [15, 20];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=1d20 --weighted');
	});
	it('should display a custom "weighted" message if the `--weighted` flag is passed: "1d20 --weighted"', function (done) {
		expectedResults.text = 'feel weighted...';
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=1d20 --weighted');
	});
	it('should be in the top 25% for each die if the `--weighted` flag is passed: "4d6 2d8 --weighted"', function (done) {
		expectedResults.betweenOrEqNums = [30, 40];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=4d6 2d8 --weighted');
	});
	it('should handle multi-digit modifiers "1d6 +22"', function (done) {
		expectedResults.betweenOrEqNums = [23, 28];
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=1d6 +22');
	});
	it('should display a friendly message when given an unparseable roll', function (done) {
		expectedResults.text = 'I don\'t know how to roll "asdf". Format die rolls as <number>d<sides>';
		express.post('/apimock', function(req, res) { apimock(req, res, done); } );
		sendRequest('user_name=Mike&channel_id=999&text=asdf');
	});
});