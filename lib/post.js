'use strict';
const Sequelize = require('sequelize');
const sequelize = new Sequelize(
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost/secret_board',
    {
        logging: false
    }
);
const Post = sequelize.define(
    'Post',
    {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: Sequelize.STRING
        },
        content: {
            type: Sequelize.TEXT
        },
        postedBy: {
            type: Sequelize.STRING
        },
        trackingCookie: {
            type: Sequelize.STRING
        }
    },
    {
        freezeTableName: true,
        timestamps: true
    }
);

Post.sync();
module.exports = Post;