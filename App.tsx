import React, { useState, useEffect } from "react";
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

// canvas
import Canvas from "react-native-canvas";
import { parse } from "@babel/core";


export default function App() {

  //Tensorflow and Permissions
  const [posenetModel, setPosenetModel] = useState<posenet.PoseNet | null>(null);
  const [frameworkReady, setFrameworkReady] = useState(false);
  const [loopStarted, setLoopStarted] = useState(false);

  let requestAnimationFrameId = 0;

  //performance hacks (Platform dependent)
  const textureDims = { width: 1600, height: 1200 };
  const tensorDims = { width: 152, height: 200 };

  const [ctx, setCanvasContext] = useState(null);

  const [debugText, setDebugText] = useState("Loading...");

  let cameraLoopStarted = false;

  //-----------------------------
  // Run effect once
  // 1. Check camera permissions
  // 2. Initialize TensorFlow
  // 3. Load Posenet Model
  //-----------------------------
  useEffect(() => {
    if (!frameworkReady) {
      (async () => {

        // we must always wait for the Tensorflow API to be ready before any TF operation...
        await tf.ready();
        console.log("TF is ready");

        console.log(await getData("test"))

        // load the mobilenet model and save it in state
        const modelJson = require("./models/model-stride16.json");
        const modelWeights = require("./models/group1-shard1of1.bin");
        setPosenetModel(await posenet.load({
          // this forces typescript to ignore type checking
          // @ts-ignore
          modelUrl: bundleResourceIO(modelJson, modelWeights)
        }).then(model => {
          console.log("Posenet model loaded");
          return model;
        }));

        setFrameworkReady(true);
      })();
    }
  }, []);


  //--------------------------
  // Run onUnmount routine
  // for cancelling animation 
  // (if running) to avoid leaks
  //--------------------------
  useEffect(() => {
    return () => {
      console.log("Unmounted!");
      cancelAnimationFrame(requestAnimationFrameId);
      setFrameworkReady(false);
    };
  }, [requestAnimationFrameId]);


  const getPrediction = async (tensor) => {
    if (!tensor || !posenetModel) return;

    // TENSORFLOW MAGIC HAPPENS HERE!
    const pose = await posenetModel.estimateSinglePose(tensor, { flipHorizontal: true })     // cannot have async function within tf.tidy
    if (!pose) return;

    var numTensors = tf.memory().numTensors;
    setDebugText(`Tensors: ${numTensors}\n\nPose:\n${JSON.stringify(pose)}`);
    // drawSkeleton(pose);
  }

  /*
  const drawPoint = (x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#00ff00";
      ctx.fill();
      ctx.closePath();
  }


  const drawSegment = (x1, y1, x2, y2) => {
      console.log(`${x1}, ${y1}, ${x2}, ${y2}`);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#00ff00";
      ctx.stroke();
      ctx.closePath();
  }


  const drawSkeleton = (pose) => {
      const minPartConfidence = 0.1;
      const adjacentKeyPoints = posenet.getAdjacentKeyPoints(pose.keypoints, minPartConfidence);
      adjacentKeyPoints.forEach((keypoints) => {
          drawSegment(keypoints[0].position.x, keypoints[0].position.y, keypoints[1].position.x, keypoints[1].position.y);
      });
  }
  */


  const handleCameraStream = (imageAsTensors) => {
    console.log("Camera loaded")
    if (cameraLoopStarted) return;      // guarantees that the image loop only runs once
    cameraLoopStarted = true;
    const loop = async () => {
      if (frameworkReady) {
        console.log("framework ready");
        const nextImageTensor = await imageAsTensors.next().value;
        if (nextImageTensor) {
          console.log("processing next image");
          await getPrediction(nextImageTensor);
          nextImageTensor.dispose();
        }
      }
      requestAnimationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }


  const handleCanvas = (canvas) => {
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    setCanvasContext(ctx);
  }


  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <StaticCamera
          textureHeight={textureDims.height}
          textureWidth={textureDims.width}
          tensorHeight={tensorDims.height}
          tensorWidth={tensorDims.width}
          handler={(imageAsTensors) => handleCameraStream(imageAsTensors)}
          width={CAM_WIDTH}
          height={CAM_HEIGHT}
        />
        <Canvas ref={handleCanvas} style={styles.canvas} />
      </View>
      <Text>{`Framework ready: ${frameworkReady}\n${debugText}`}</Text>
    </View>
  );
}

const CAM_WIDTH = Dimensions.get("window").width;
const CAM_HEIGHT = CAM_WIDTH * 4 / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: Constants.statusBarHeight,
    backgroundColor: "#E8E8E8"
  },
  body: {
  },
  canvas: {
    width: CAM_WIDTH,
    height: CAM_HEIGHT,
    zIndex: 2,
    position: "absolute"
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
