/*
   Run the development TiddlyWiki server by simply running
   this (fake) node module. This module is wired up as the "main"
   module in the package metadata.
*/
var $tw = require("tiddlywiki").TiddlyWiki();
var args = "editions/develop --verbose --listen port=8080";
console.log("Booting TW:", args);
$tw.boot.argv = args.split(" ");
$tw.boot.boot();
