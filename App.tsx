import React, { useState, useEffect, useRef, createRef } from "react";
import { Text, View, StyleSheet, Button, Dimensions } from "react-native";
import Constants from "expo-constants";

// camera
import { cameraWithTensors } from "@tensorflow/tfjs-react-native";
import { Camera } from "expo-camera";

// tensorflow
import * as tf from "@tensorflow/tfjs";
import * as posenet from "@tensorflow-models/posenet";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as knn from "@tensorflow-models/knn-classifier";

// canvas
import Canvas, { Path2D } from "react-native-canvas";
import { tensor, Tensor3D } from "@tensorflow/tfjs";
import { PosenetInput } from "@tensorflow-models/posenet/dist/types";


interface IState {
  // will cause rerender
  running: boolean,

  // will not cause rerender
  frameworkReady: boolean,
  cameraReady: boolean,
  posenetModel: posenet.PoseNet | null,
  imageAsTensors: IterableIterator<Tensor3D> | null,
  canvas: any,
  ctx: any,
  classifier: knn.KNNClassifier | null,
  debugText: string,
  learning: number,
  rafId: number
}


// performance hacks (Platform dependent)
const textureDims = { width: 1600, height: 1200 };
const tensorDims = { width: 152, height: 200 };
const TensorCamera = cameraWithTensors(Camera);


class App extends React.Component<any, IState> {

  constructor(props) {
    super(props);
    this.state = {
      frameworkReady: false,
      cameraReady: false,
      running: false,
      posenetModel: null,
      imageAsTensors: null,
      canvas: null,
      ctx: null,
      classifier: null,
      learning: 0,
      rafId: 0,
      debugText: "Loading..."
    }
  }


  setFrameworkReady = (v: boolean) => {
    this.setState({ frameworkReady: v }, () => {
      if (v && this.state.cameraReady) {
        this.start();
      } else {
        this.halt();
      }
    });
  }


  setCameraReady = (v: boolean) => {
    this.setState({ cameraReady: v }, () => {
      if (v && this.state.frameworkReady) {
        this.start();
      } else {
        this.halt();
      }
    });
  }


  print = (s) => {
    this.setState({ debugText: s });
  }


  componentDidMount() {
    (async () => {

      const { status } = await Camera.requestPermissionsAsync();
      console.log(`permissions: ${status}`);

      // we must always wait for the Tensorflow API to be ready before any TF operation...
      await tf.ready();
      console.log("TF is ready");

      this.setState({
        posenetModel: await posenet.load({
          architecture: "MobileNetV1",
          outputStride: 16,
          multiplier: 0.5,
          inputResolution: tensorDims,
          quantBytes: 2
        }).then(model => {
          console.log("Posenet model loaded");
          return model;
        }),
        classifier: knn.create(),
      });

      this.setFrameworkReady(true);
    })();
  }


  getPrediction = async (tensor: PosenetInput) => {
    if (!tensor || !this.state.posenetModel) {
      console.log("posenetModel or tensor undefined");
      return;
    }
    
    const t0 = performance.now();
    // TENSORFLOW MAGIC HAPPENS HERE!
    const pose = await this.state.posenetModel.estimateSinglePose(tensor, { flipHorizontal: true })
    if (!pose) {
      console.log("pose estimation error");
      return;
    }
    const poseTime = performance.now() - t0;

    const t1 = performance.now();

    this.drawSkeleton(pose);

    let tens = tf.tensor2d(pose.keypoints.map(x => [x.position.x, x.position.y]));
    let str = "learning...";
    if (this.state.learning > 0) {
      if (this.state.learning % 2 == 1) {
        this.state.classifier?.addExample(tens, this.state.learning); // int learning will be the label for our class
      } else {
        str = JSON.stringify(await this.state.classifier?.predictClass(tens, 5));
      }
    }
    tens.dispose();
    let numTensors = tf.memory().numTensors;

    this.print(`Tensors: ${numTensors}\nLearning: ${this.state.learning} \nPose: ${str}`);
  }


  drawPoint = (path, x, y) => {
    const x1 = (CAM_WIDTH / tensorDims.width) * x;
    const y1 = (CAM_HEIGHT / tensorDims.height) * y;
    path.arc(x1, y1, 4, 0, 2 * Math.PI);
    path.closePath();
  }


  drawSegment = (path, x1, y1, x2, y2) => {
    const x3 = (CAM_WIDTH / tensorDims.width) * x1;
    const y3 = (CAM_HEIGHT / tensorDims.height) * y1;
    const x4 = (CAM_WIDTH / tensorDims.width) * x2;
    const y4 = (CAM_HEIGHT / tensorDims.height) * y2;
    path.moveTo(x3, y3);
    path.lineTo(x4, y4);
    path.closePath();
  }


  drawSkeleton = (pose) => {
    let dots2d = new Path2D(this.state.canvas);
    let lines2d = new Path2D(this.state.canvas);
    const minPartConfidence = 0.1;
    for (var i = 0; i < pose.keypoints.length; i++) {
      const keypoint = pose.keypoints[i];
      if (keypoint.score >= minPartConfidence) {
        this.drawPoint(dots2d, keypoint.position.x, keypoint.position.y);
      }
    }
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(pose.keypoints, minPartConfidence);
    adjacentKeyPoints.forEach((keypoints) => {
      this.drawSegment(lines2d, keypoints[0].position.x, keypoints[0].position.y, keypoints[1].position.x, keypoints[1].position.y);
    });
    this.state.ctx?.clearRect(0, 0, CAM_WIDTH, CAM_HEIGHT);
    this.state.ctx?.fill(dots2d);
    this.state.ctx?.stroke(lines2d);
  }


  start = () => {
    console.log("starting loop");
    this.loop();
    this.setState({ running: true });
  }


  halt = () => {
    cancelAnimationFrame(this.state.rafId);
    console.log(`stopped!`);
    this.setState({ running: false });
  }


  loop = async () => {
    const nextImageTensor = this.state.imageAsTensors?.next().value;
    if (nextImageTensor) {
      this.getPrediction(nextImageTensor).then(() => {
        nextImageTensor.dispose();
        this.setState({ rafId: requestAnimationFrame(this.loop) });
      });
    }
  }


  handleCameraStream = async (iat) => {
    console.log("Camera loaded");
    this.setState({ imageAsTensors: iat });
    this.setCameraReady(true);
  }


  handleCanvas = (can) => {
    if (can === null) return;
    can.height = CAM_HEIGHT;
    can.width = CAM_WIDTH;
    let context = can.getContext("2d");
    context.fillStyle = "#00ff00";
    context.strokeStyle = "#00ff00";
    this.setState({ canvas: can, ctx: context });
  }


  render() {
    return (
      <View style={styles.container} >
        <View>
          <TensorCamera style={styles.camera}
            type={Camera.Constants.Type.front}
            zoom={0}
            cameraTextureHeight={textureDims.height}
            cameraTextureWidth={textureDims.width}
            resizeHeight={tensorDims.height}
            resizeWidth={tensorDims.width}
            resizeDepth={3}
            onReady={this.handleCameraStream}
            autorender={true}
          />
          <Canvas ref={this.handleCanvas} style={styles.canvas} />
        </View>
        <Button title="Log states" onPress={() => {
          console.log(`========================\nframeworkReady: ${this.state.frameworkReady}\nimageAsTensors: ${this.state.imageAsTensors ? "loaded" : "unloaded"}\nrafId: ${this.state.rafId}\n========================`);
        }} />
        <Button color={"#cc77cc"} title={this.state.learning % 2 == 0 ? `Start learning (${this.state.learning / 2} learned)` : `Learning class ${this.state.learning}`} onPress={() => this.setState({ learning: this.state.learning + 1 })} />
        <Button color={this.state.running ? "#ee5511" : "#33cc44"} title={`${this.state.running ? "Stop" : "Start"} animation`} onPress={this.state.running ? this.halt : this.start} />
        <Text>{this.state.debugText}</Text>
      </View>
    );
  }
}

const CAM_WIDTH = Dimensions.get("window").width;
const CAM_HEIGHT = CAM_WIDTH * 4 / 3;

const styles = StyleSheet.create({
  container: {
    paddingTop: Constants.statusBarHeight
  },
  canvas: {
    position: "absolute",
    zIndex: 2,
    borderWidth: 1,
    borderColor: "red"
  },
  camera: {
    width: CAM_WIDTH,
    height: CAM_HEIGHT,
    zIndex: 0
  }
});


export default App;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// Stores the data; no need to worry about converting to strings ;)
// (key needs to be string tho)
const storeData = async (key, value) => {
  try {
    if (typeof value === "object") {
      value = "json|" + JSON.stringify(value);
    } else {
      value = typeof value + "|" + value;
    }
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    // saving error
    console.log("storeData error: " + e.message);
  }
}


// Gets the data; no need to worry about converting from strings ;)
// (key needs to be string tho)
const getData = async (key) => {
  try {
    var value = await AsyncStorage.getItem(key);
    if (value !== null) {
      // value previously stored
      let type = value.split("|")[0];
      value = value.substr(type.length + 1);
      let parsedValue;
      switch (type) {
        case "json":
          parsedValue = JSON.parse(value);
          break;
        case "boolean":
          parsedValue = value === "true";
          break;
        case "number":
          parsedValue = Number(value);
          break;
      }
      return parsedValue;
    }
    return null;
  } catch (e) {
    // error reading value
    console.log("getData error: " + e.message);
  }
}
