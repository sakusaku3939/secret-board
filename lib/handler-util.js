'use strict';
var fs = require('fs');

function handleLogin(req, res) {
    fs.readFile('./lib/login.html', function (err, data) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
    });
}

function handleLogout(req, res) {
    res.writeHead(401, {
        'Content-Type': 'text/html; charset=utf-8'
    });
    res.end('<!DOCTYPE html><html lang="ja"><body>' +
        '<h1>ログアウトしました</h1>' +
        '<a href="/posts">ログイン</a>' +
        '</body></html>'
    );
}

function handleNotFound(req, res) {
    res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end('ページがみつかりません');
}

function handleBadRequest(req, res) {
    res.writeHead(400, {
        'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end('未対応のリクエストです');
}


module.exports = {
    handleLogin,
    handleLogout,
    handleNotFound,
    handleBadRequest
};