#! /bin/bash

set -e

FILE=posts/$1.jade
TEMPLATE=templates/post.jade.template
DATE=`date +%Y-%m-%d`

if ! test -e $FILE; then
echo "//- date: $DATE
//- title: $1
//- tags:" > $FILE
fi

vim $FILE
