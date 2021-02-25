import React from "react";
import { View } from "react-native";
import Canvas from "react-native-canvas"

export default class App extends React.Component {

  render() {
    return (
      <View>
        <Canvas style={{
          borderWidth: 1,
          borderColor: "red"
        }} ref={this.handleCanvas} />
      </View>
    );
  }

  handleCanvas = (canvas) => {
    canvas.width = 400;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "purple";
    ctx.fillRect(0, 0, 360, 500);
  }

}