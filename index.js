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
      const link = `/articles/${basename}`
      const attributes = exactArticleAttributes(content);
      const body = jade.compile(content, {filename})({attributes});
      callback(null, Object.assign({body, basename, link}, attributes));
    });
  }, (err, articles) => {

    // sort articles
    const sortedArticles = articles.sort((a, b) => b.timestamp - a.timestamp);

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

function getArticlesAt(articles, page, articlesPerPage) {
  return articles.slice(articlesPerPage * page, articlesPerPage * (page + 1));
}

function renderArticles(blogProps, callback) {
  waterfall([
    partial(mkdirp, "public/articles"),
    partial(each, blogProps.pages, (page, callback) => {
      each(page.articles, (article, callback) => {
        fs.writeFile(
          `public/articles/${article.basename}.html`,
          jade.compileFile("templates/article.jade")(Object.assign({article}, blogProps)),
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

function getPages(articles) {
  const pages = range(articles.length / 5 + 1 | 1).map(page => {
    return {
      link: `/pages/${page}`,
      index: page,
      articles: getArticlesAt(articles, page, 5),
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

function createBlogProps(articles, callback) {
  callback(
    null,
    {
      meta,
      pages: getPages(articles),
    }
  );
}

waterfall([
  partial(glob, "articles/*.jade", {}),
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
