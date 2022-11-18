'use strict';

const timeRatio = 1000 * 60 * 60 * 24;
var floor = Math.floor, abs = Math.abs;
var daysBetween = (d1, d2) => floor(abs(new Date(d1) - new Date(d2)) / timeRatio);

const date = new Date();
let day = date.getDate();
let month = date.getMonth() + 1;
let year = date.getFullYear();

console.log('diff: %s days', daysBetween('2020-07-06', `${year}-${month}-${day}`));