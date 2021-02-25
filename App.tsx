import {
  Platform,
  StyleSheet,
  Text,
  View,
  TouchableHighlight
} from 'react-native';

import React, {Component} from "react";

import {
  requireNativeComponent,
  findNodeHandle,
  NativeModules,

} from 'react-native';

import {
  GCanvasView,
} from 'react-native-gcanvas';
const { enable, ReactNativeBridge, Image: GImage } = require('@gcanvas/core');

ReactNativeBridge.GCanvasModule = NativeModules.GCanvasModule;
ReactNativeBridge.Platform = Platform;
export default class App extends Component {

  //draw something with gcanvas
  draw() => {
    var ref = this.refs.canvas_holder;

    //must convert canvas tag to a string
    var canvas_tag = findNodeHandle(ref);
    var el = { ref:""+canvas_tag, style:{width:414, height:376}};
    ref = enable(el, {bridge: ReactNativeBridge});

    //TODO get context by yourself
    var ctx = ref.getContext('2d');
    //rect
    ctx.fillStyle = 'green';
    ctx.fillRect(0, 0, 100, 100);

    //rect
    ctx.fillStyle = 'black';
    ctx.fillRect(100, 100, 100, 100);
    ctx.fillRect(25, 205, 414-50, 5);

    //circle
    ctx.arc(200, 315, 100, 0, Math.PI * 2, true);
    ctx.fill();

    var image = new GImage();
    image.onload = function(){
      ctx.drawImage(image, 150, 0);
      ctx.drawImage(image, 150, 450);
    }
    image.src = '//gw.alicdn.com/tfs/TB1KwRTlh6I8KJjy0FgXXXXzVXa-225-75.png';
  }

  //render
  render(){
      return  <GCanvasView ref='canvas_holder' style={top: 20,width: 414,height :700,backgroundColor: '#FF000030'}></GCanvasView>  
  }

}