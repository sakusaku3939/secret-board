'use strict';
const postsHandler = require('./posts-handler');
const util = require('./handler-util');

function route(req, res) {
    if (process.env.DATABASE_URL
        && req.headers['x-forwarded-proto'] === 'http') {
        util.handleNotFound(req, res);
    }
    switch (req.url) {
        case '/posts':
            postsHandler.handle(req, res, 0);
            break;
        case '/posts?message=1':
            postsHandler.handle(req, res, 1);
            break;
        case '/posts?message=2':
            postsHandler.handle(req, res, 2);
            break;
        case '/posts?delete=1':
            postsHandler.handleDelete(req, res);
            break;
        case '/login':
            postsHandler.handleLogin(req, res);
            break;
        case '/logout':
            postsHandler.handleLogout(req, res);
            break;
        default:
            util.handleNotFound(req, res);
            break;
    }
}

module.exports = {
    route
};