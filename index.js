"use strict";

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const jade = require("jade");
const waterfall = require("async-waterfall");
const each = require("async-each");
const mkdirp = (dirname, callback) => require("mkdirp")(dirname, err => callback(err));
const partial = require("lodash.partial");
const trimStart = require("lodash.trimstart");
const groupBy = require("lodash.groupby");
const range = require("lodash.range");
const meta = require("./meta");
const moment = require("moment");
const md5 = require("md5");

function exactArticleAttributes(content) {
  const attributes = {};

  const lines = content.toString().split("\n");
  const commentLines = lines.filter(line => /^ *\/\/-/.test(line));
  const attributeLines = commentLines.filter(line => line.includes(":"))

  attributeLines.forEach(line => {
    const splited = trimStart(line, " //-").split(":");
    const name = splited[0].trim();
    const rawValue = splited.slice(1).join("").trim()

    switch(name) {
      case "date":
        attributes["timestamp"] = moment(rawValue.replace(/\//g, "-")).unix();
        attributes["date"] = rawValue;
        break;
      case "tags":
        attributes["tags"] = rawValue.split(",").map(tag => tag.trim());
        break;
      default:
        attributes[name] = rawValue;
    }
  });

  return attributes;
}

function createArticles(filenames, callback) {
  each(filenames, (filename, callback) => {
    fs.readFile(filename, (err, content) => {
      const basename = path.basename(filename, ".jade");
      const link = `/posts/${basename}`
      const attributes = exactArticleAttributes(content);
      const body = jade.compile(content, {filename})({attributes});
      let excerpt = body;

      // check excerpt
      const splitedContents = content.toString().split(/ *\/\/- *more */g);
      if(splitedContents.length > 1) {
        // has excerpt
        excerpt = jade.compile(splitedContents[0], {filename})({attributes});
      }

      callback(null, Object.assign({body, excerpt, basename, link}, attributes));
    });
  }, (err, posts) => {

    // sort posts
    const sortedArticles = posts.sort((a, b) => b.timestamp - a.timestamp);

    // add next prev links
    for(let i = 0; i < sortedArticles.length; i++) {
      if(i > 0){
        sortedArticles[i].nextLink = sortedArticles[i - 1].link;
      }
      if(i < sortedArticles.length - 1) {
        sortedArticles[i].prevLink = sortedArticles[i + 1].link;
      }
    }

    callback(err, sortedArticles);
  });
}

function getArticlesAt(posts, page, postsPerPage) {
  return posts.slice(postsPerPage * page, postsPerPage * (page + 1));
}

function renderArticles(blogProps, callback) {
  waterfall([
    partial(mkdirp, "public/posts"),
    partial(each, blogProps.pages, (page, callback) => {
      each(page.posts, (post, callback) => {
        fs.writeFile(
          `public/posts/${post.basename}.html`,
          jade.compileFile("templates/post.jade")(Object.assign({post}, blogProps)),
          callback
        );
      }, callback);
    }),
  ], (err) => callback(err));
}

function renderPages(blogProps, callback) {
  waterfall([
    partial(mkdirp, "public/pages"),
    partial(each, blogProps.pages, (page, callback) => {
      fs.writeFile(
        `public/pages/${page.index}.html`,
        jade.compileFile("templates/page.jade")(Object.assign({page}, blogProps)),
        callback
      );
    }, err => callback(err)),
  ]);
}

function renderIndex(blogProps, callback) {
  waterfall([
    partial(mkdirp, "public"),
    partial(
      fs.writeFile,
      "public/index.html",
      jade.compileFile("templates/index.jade")(Object.assign({page: blogProps.pages[0]}, blogProps))
    ),
  ]);
}

function constructBlog(blogProps, callback) {
  waterfall([
    partial(renderArticles, blogProps),
    partial(renderPages, blogProps),
    partial(renderIndex, blogProps),
  ], callback);
}

function getPages(posts) {
  const pages = range(posts.length / 5 + 1 | 1).map(page => {
    return {
      link: `/pages/${page}`,
      index: page,
      posts: getArticlesAt(posts, page, 5),
    };
  });

  // add next prev links
  for(let i = 0; i < pages.length; i++) {
    if(i > 0){
      pages[i].nextLink = i - 1 === 0 ? "/" : pages[i - 1].link;
    }
    if(i < pages.length - 1) {
      pages[i].prevLink = pages[i + 1].link;
    }
  }

  return pages;
}

function createBlogProps(posts, callback) {
  callback(
    null,
    {
      hash: md5("salt-puwbiyskcythc855-" + Date.now()),
      meta,
      pages: getPages(posts),
    }
  );
}

waterfall([
  partial(glob, "posts/*.jade", {}),
  createArticles,
  createBlogProps,
  constructBlog,
], e => {
  if(e) {
    console.log(e);
  } else {
    console.log("Blog is constructed!");
  }
});
