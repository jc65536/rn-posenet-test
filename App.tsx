import React, { useState, useEffect, useRef } from "react";
import { ActivityIndicator, Text, View, ScrollView, StyleSheet, Button, Platform, Dimensions } from "react-native";
import Constants from "expo-constants";

// camera
import { Camera } from "expo-camera";
import StaticCamera from "./StaticCamera";

// tensorflow
import * as tf from "@tensorflow/tfjs";
import * as posenet from "@tensorflow-models/posenet";
import { bundleResourceIO, cameraWithTensors } from "@tensorflow/tfjs-react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as knn from "@tensorflow-models/knn-classifier";

// canvas
import Canvas, { Path2D } from "react-native-canvas";
import { parse } from "@babel/core";
import { imag, tensor, Tensor, Tensor3D } from "@tensorflow/tfjs";
import { PosenetInput } from "@tensorflow-models/posenet/dist/types";


export default function App() {

  // performance hacks (Platform dependent)
  const textureDims = { width: 1600, height: 1200 };
  const tensorDims = { width: 152, height: 200 };

  // global variables
  const posenetModel = useRef<posenet.PoseNet>();
  const imageAsTensors = useRef<IterableIterator<Tensor3D>>();
  const canvas = useRef<{ height: number; width: number; getContext: (arg0: string) => any; }>();
  const ctx = useRef();
  const classifier = useRef<knn.KNNClassifier>();
  const learning = useRef(3);
  const rafId = useRef(0);

  // state variables
  const [frameworkReady, setFrameworkReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [debugText, setDebugText] = useState("Loading...");


  useEffect(() => {
    (async () => {

      // we must always wait for the Tensorflow API to be ready before any TF operation...
      await tf.ready();
      console.log("TF is ready");

      // load the mobilenet model and save it in state
      posenetModel.current = await posenet.load({
        architecture: "MobileNetV1",
        outputStride: 16,
        multiplier: 0.5,
        inputResolution: tensorDims,
        quantBytes: 2
      }).then(model => {
        console.log("Posenet model loaded");
        return model;
      });

      classifier.current = knn.create();

      setFrameworkReady(true);
    })();
  }, []);


  useEffect(() => {
    if (frameworkReady && cameraReady) {
      console.log("framework and camera ready");
      setRunning(true);
    }
  }, [frameworkReady, cameraReady]);


  useEffect(() => {
    if (running) {
      console.log("starting loop");
      loop();
    } else {
      cancelAnimationFrame(rafId.current);
      console.log(`stopped!`);
    }
  }, [running])


  const getPrediction = async (tensor: PosenetInput) => {
    if (!tensor || !posenetModel.current) {
      console.log("posenetModel or tensor undefined");
      return;
    }
    
    const t0 = performance.now();
    // TENSORFLOW MAGIC HAPPENS HERE!
    const pose = await posenetModel.current?.estimateSinglePose(tensor, { flipHorizontal: true })
    if (!pose) {
      console.log("pose estimation error");
      return;
    }
    const poseTime = performance.now() - t0;

    const t1 = performance.now();

    drawSkeleton(pose);

    const drawTime = performance.now() - t1;

    const t2 = performance.now();

    let coords = pose.keypoints.map(x => [x.position.x, x.position.y]);
    let tens = tf.tensor2d(coords);
    if (learning.current != 3) {
      if (learning.current % 2 == 0) {
        // @ts-ignore
        classifier.addExample(tens, learning); // int learning will be the label for our class
      } else {
        // @ts-ignore
        classifier.predictClass(tens, k = 5).then(obj => setDebugText(JSON.stringify(obj)));
      }
    }
    tens.dispose();

    const learnTime = performance.now() - t2;

    let numTensors = tf.memory().numTensors;
    setDebugText(`Tensors: ${numTensors}\nLearning: ${learning} \nPose Time: ${poseTime}\nDraw Time: ${drawTime}\nLearn Time: ${learnTime}\nTotal Time: ${learnTime + poseTime + drawTime}`);
  }


  const drawPoint = (path, x, y) => {
    const x1 = (CAM_WIDTH / tensorDims.width) * x;
    const y1 = (CAM_HEIGHT / tensorDims.height) * y;
    path.arc(x1, y1, 4, 0, 2 * Math.PI);
    path.closePath();
  }


  const drawSegment = (path, x1, y1, x2, y2) => {
    const x3 = (CAM_WIDTH / tensorDims.width) * x1;
    const y3 = (CAM_HEIGHT / tensorDims.height) * y1;
    const x4 = (CAM_WIDTH / tensorDims.width) * x2;
    const y4 = (CAM_HEIGHT / tensorDims.height) * y2;
    path.moveTo(x3, y3);
    path.lineTo(x4, y4);
    path.lineWidth = 4;
    path.closePath();
  }


  const drawSkeleton = (pose) => {
    let dots2d = new Path2D(canvas.current);
    let lines2d = new Path2D(canvas.current);
    const minPartConfidence = 0.1;
    for (var i = 0; i < pose.keypoints.length; i++) {
      const keypoint = pose.keypoints[i];
      if (keypoint.score >= minPartConfidence) {
        drawPoint(dots2d, keypoint.position.x, keypoint.position.y);
      }
    }
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(pose.keypoints, minPartConfidence);
    adjacentKeyPoints.forEach((keypoints) => {
      drawSegment(lines2d, keypoints[0].position.x, keypoints[0].position.y, keypoints[1].position.x, keypoints[1].position.y);
    });
    // @ts-ignore
    ctx.current?.clearRect(0, 0, CAM_WIDTH, CAM_HEIGHT);
    // @ts-ignore
    ctx.current?.fill(dots2d);
    // @ts-ignore
    ctx.current?.stroke(lines2d);
  }


  const loop = async () => {
    // @ts-ignore
    const nextImageTensor = imageAsTensors.current.next().value;
    if (nextImageTensor) {
      getPrediction(nextImageTensor).then(() => {
        nextImageTensor.dispose();
        rafId.current = requestAnimationFrame(loop);
      });
    }
  }


  const handleCameraStream = async (iat) => {
    console.log("Camera loaded");
    imageAsTensors.current = iat;
    setCameraReady(true);
  }


  const handleCanvas = (can: { height: number; width: number; getContext: (arg0: string) => any; } | null) => {
    if (can === null) return;
    can.height = CAM_HEIGHT;
    can.width = CAM_WIDTH;
    const context = can.getContext("2d");
    context.fillStyle = "red";
    context.strokeStyle = "green";
    canvas.current = can;
    ctx.current = context;
  }


  return (
    <View style={styles.container}>
      <View>
        <StaticCamera
          textureHeight={textureDims.height}
          textureWidth={textureDims.width}
          tensorHeight={tensorDims.height}
          tensorWidth={tensorDims.width}
          handler={(iat) => handleCameraStream(iat)}
          width={CAM_WIDTH}
          height={CAM_HEIGHT}
        />
        <Canvas ref={handleCanvas} style={styles.canvas} />
      </View>
      <Button title="Log states" onPress={() => {
        console.log(`========================\nframeworkReady: ${frameworkReady}\nimageAsTensors: ${imageAsTensors.current ? "loaded" : "unloaded"}\nrunning: ${running}\nrafId: ${rafId}\n========================`);
      }} />
      <Button color={"#cc77cc"} title={learning.current == 3 ? "Start learning" : "Learning class " + learning.current} onPress={() => learning.current--} />
      <Button color={running ? "#ee5511" : "#33cc44"} title={`${running ? "Stop" : "Start"} animation`} onPress={() => setRunning(!running)} />
      <Text>{debugText}</Text>
    </View>
  );
}

const CAM_WIDTH = Dimensions.get("window").width;
const CAM_HEIGHT = CAM_WIDTH * 4 / 3;

const styles = StyleSheet.create({
  container: {
    paddingTop: Constants.statusBarHeight,
    backgroundColor: "#E8E8E8"
  },
  canvas: {
    position: "absolute",
    zIndex: 2,
    borderWidth: 1,
  }
});



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
