'use strict';
const crypto = require('crypto');
const pug = require('pug');
const Cookies = require('cookies');
const moment = require('moment-timezone');
const util = require('./handler-util');
const Post = require('./post');
const fs = require('fs');
const bcrypt = require('bcrypt');

const trackingIdKey = 'tracking_id';
const oneTimeTokenMap = new Map();

function handle(req, res, message) {
    const cookies = new Cookies(req, res);
    const reqUser = requestUser(req, res);
    const trackingId = addTrackingCookie(cookies, reqUser);

    switch (req.method) {
        case 'GET':
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8'
            });
            Post.findAll({ order: [['id', 'DESC']] }).then((posts) => {
                posts.forEach((post) => {
                    post.content = post.content.replace(/\+/g, ' ');
                    post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
                });
                const oneTimeToken = crypto.randomBytes(8).toString('hex');
                oneTimeTokenMap.set(reqUser, oneTimeToken);
                res.end(pug.renderFile('./views/posts.pug', {
                    posts: posts,
                    user: reqUser,
                    oneTimeToken: oneTimeToken,
                    message: message
                }));
                console.info(
                    `閲覧されました: user: ${reqUser}, ` +
                    `trackingId: ${trackingId},` +
                    `remoteAddress: ${req.connection.remoteAddress}, ` +
                    `userAgent: ${req.headers['user-agent']} `
                );
            });
            break;
        case 'POST':
            let body = [];
            req.on('data', (chunk) => {
                body.push(chunk);
            }).on('end', () => {
                body = Buffer.concat(body).toString();
                const decoded = decodeURIComponent(body);
                const matchResult = decoded.match(/content=([\s\S]*)&oneTimeToken=(.*)/);
                if (!matchResult) {
                    util.handleBadRequest(req, res);
                } else {
                    const content = matchResult[1];
                    const requestedOneTimeToken = matchResult[2];
                    if (oneTimeTokenMap.get(reqUser) === requestedOneTimeToken) {
                        if (content !== "") {
                            console.info('投稿されました: ' + content);
                            Post.create({
                                content: content,
                                trackingCookie: trackingId,
                                postedBy: reqUser
                            }).then(() => {
                                oneTimeTokenMap.delete(reqUser);
                                handleRedirectPosts(req, res);
                            });
                        } else {
                            handleRedirectPosts(req, res);
                        }
                    } else {
                        util.handleBadRequest(req, res);
                    }
                }
            });
            break;
        default:
            util.handleBadRequest(req, res);
            break;
    }
}

function handleDelete(req, res) {
    switch (req.method) {
        case 'POST':
            let body = [];
            req.on('data', (chunk) => {
                body.push(chunk);
            }).on('end', () => {
                body = Buffer.concat(body).toString();
                const decoded = decodeURIComponent(body);
                const matchResult = decoded.match(/id=(.*)&oneTimeToken=(.*)/);
                if (!matchResult) {
                    util.handleBadRequest(req, res);
                } else {
                    const id = matchResult[1];
                    const requestedOneTimeToken = matchResult[2];
                    const reqUser = requestUser(req, res);
                    if (oneTimeTokenMap.get(reqUser) === requestedOneTimeToken) {
                        Post.findByPk(id).then((post) => {
                            if (reqUser === post.postedBy || reqUser === 'admin') {
                                post.destroy().then(() => {
                                    console.info(
                                        `削除されました: user: ${reqUser}, ` +
                                        `remoteAddress: ${req.connection.remoteAddress}, ` +
                                        `userAgent: ${req.headers['user-agent']} `
                                    );
                                    oneTimeTokenMap.delete(reqUser);
                                    handleRedirectPosts(req, res);
                                });
                            } else {
                                util.handleBadRequest(req, res);
                            }
                        });
                    }
                }
            });
            break;
        default:
            util.handleBadRequest(req, res);
            break;
    }
}

function handleLogin(req, res) {
    const reqUser = requestUser(req, res);
    switch (req.method) {
        case 'GET':
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8'
            });
            const oneTimeToken = crypto.randomBytes(8).toString('hex');
            oneTimeTokenMap.set(reqUser, oneTimeToken);
            res.end(pug.renderFile('./views/login.pug', { oneTimeToken: oneTimeToken }))
            break;
        case 'POST':
            let body = [];
            req.on('data', (chunk) => {
                body.push(chunk);
            }).on('end', () => {
                body = Buffer.concat(body).toString();
                const decoded = decodeURIComponent(body);
                const matchResult = decoded.match(/username=(.*)&password=(.*)&oneTimeToken=(.*)/);
                if (!matchResult) {
                    util.handleBadRequest(req, res);
                } else {
                    const username = matchResult[1];
                    const password = matchResult[2];
                    const requestedOneTimeToken = matchResult[3];
                    if (oneTimeTokenMap.get(reqUser) === requestedOneTimeToken) {
                        oneTimeTokenMap.delete(reqUser);
                        const result = usersData().some((data) => {
                            const match = data.match(/(.*):(.*):(.*)/);
                            const matchUser = match[1] === username;
                            const matchPassword = bcrypt.compareSync(password, match[2]);
                            if (matchUser && matchPassword) {
                                console.info(
                                    `ログインしました: user: ${reqUser}, ` +
                                    `remoteAddress: ${req.connection.remoteAddress}, ` +
                                    `userAgent: ${req.headers['user-agent']} `
                                );
                                const cookies = new Cookies(req, res);
                                const originalId = match[3];
                                setCookies(cookies, originalId, username);
                                return true;
                            }
                        })
                        result ? handleRedirectPosts(req, res, '?message=1') : handleRedirectLogin(req, res);
                    } else {
                        util.handleBadRequest(req, res);
                    }
                }
            });
            break;
        default:
            util.handleBadRequest(req, res);
            break;
    }
}

function handleLogout(req, res) {
    const cookies = new Cookies(req, res);
    const originalId = parseInt(crypto.randomBytes(8).toString('hex'), 16);
    setCookies(cookies, originalId, "guestmode");
    handleRedirectPosts(req, res, '?message=2');
}

/**
 * Cookieに含まれているトラッキングIDに異常がなければその値を返し、
 * 存在しない場合や異常なものである場合には、再度作成しCookieに付与してその値を返す
 * @param {Cookies} cookies
 * @param {String} userName
 * @return {String} トラッキングID
 */
function addTrackingCookie(cookies, userName) {
    const requestedTrackingId = cookies.get(trackingIdKey);
    if (isValidTrackingId(requestedTrackingId, userName)) {
        return requestedTrackingId;
    } else {
        const originalId = parseInt(crypto.randomBytes(8).toString('hex'), 16);
        const trackingId = setCookies(cookies, originalId, userName);
        return trackingId;
    }
}

function setCookies(cookies, originalId, userName) {
    const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
    const trackingId = originalId + '_' + createValidHash(originalId, userName);
    cookies.set(trackingIdKey, trackingId, { expires: tomorrow });
    return trackingId;
}

function isValidTrackingId(trackingId, userName) {
    if (!trackingId) {
        return false;
    }
    const splitted = trackingId.split('_');
    const originalId = splitted[0];
    const requestedHash = splitted[1];
    return createValidHash(originalId, userName) === requestedHash;
}

const secretKey =
    '06ee3dde58dd72e807f7912d593a81578ae73e09687ad62daaa5801c28a86da04a3' +
    '6d1a379999754a17caf03df9fff83b110f927dd2e0e400e2ffad358cb02969561b4' +
    '032885874e4fe63134f1766d59fad2853e7cefaa8fef03be398866c3889fb2ef0ee' +
    '42a51c26867924570f03ff6aa5d1d79c8c162a9333b0bbeacfc089d0fcca161720b' +
    '1642aecf93ba00a00b4f785899b027b8e7aafc47959ca3c3703a282db73b76bb474' +
    '64b779d04933c4246b934b2b6df49e070c495f8d3d77ca6a836b1e919ce80959e86' +
    '263301b3fcf428cc595572cc90b495d2fe1f352c4aa4f373da8cd9e1f61436479f9' +
    'd0ef6fcba42810b8c55e31d5c707485ec39a38f3861';

function createValidHash(originalId, userName) {
    const sha1sum = crypto.createHash('sha1');
    sha1sum.update(originalId + userName + secretKey);
    return sha1sum.digest('hex');
}

function handleRedirectPosts(req, res, parameter = '') {
    res.writeHead(303, {
        'Location': '/posts' + parameter
    });
    res.end();
}

function handleRedirectLogin(req, res) {
    res.writeHead(303, {
        'Location': '/login'
    });
    res.end();
}

function usersData() {
    const fileData = fs.readFileSync("./users.htpasswd", "utf8");
    const lines = fileData.toString().split(/\n/).filter(v => v);
    return lines;
}

function requestUser(req, res) {
    const cookies = new Cookies(req, res);
    const requestedTrackingId = cookies.get(trackingIdKey);
    const result = requestedTrackingId && usersData().find(data => requestedTrackingId.split('_')[0] === data.match(/(.*):(.*):(.*)/)[3])
    return result ? result.match(/(.*):(.*):(.*)/)[1] : "guestmode";
}

module.exports = {
    handle,
    handleDelete,
    handleLogin,
    handleLogout
};