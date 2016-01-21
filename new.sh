#! /bin/bash

set -e

FILE=articles/$1.jade
TEMPLATE=templates/article.jade.template
DATE=`date +%Y-%m-%d`

if ! test -e $FILE; then
echo "//- date: $DATE
//- title: $1
//- tags:" > $FILE
fi

vim $FILE
