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
import { KNNClassifier } from "@tensorflow-models/knn-classifier";

// canvas
import Canvas, {Path2D} from "react-native-canvas";
import { parse } from "@babel/core";
import { imag, tensor, Tensor, Tensor3D } from "@tensorflow/tfjs";
import { PosenetInput } from "@tensorflow-models/posenet/dist/types";

const TensorCamera = cameraWithTensors(Camera);


export default function App() {

  //Tensorflow and Permissions
  const [posenetModel, setPosenetModel] = useState<posenet.PoseNet | null>(null);
  const [frameworkReady, setFrameworkReady] = useState(false);
  const [imageAsTensors, setImageAsTensors] = useState<IterableIterator<Tensor3D> | null>(null);
  const [running, setRunning] = useState(false);

  const rafId = React.useRef(0);

  //performance hacks (Platform dependent)
  const textureDims = { width: 1600, height: 1200 };
  const tensorDims = { width: 152, height: 200 };

  const [ctx, setCanvasContext] = useState(null);

  const [debugText, setDebugText] = useState("Loading...");

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

        // load the mobilenet model and save it in state
        const modelJson = require("./models/model-stride16.json");
        const modelWeights = require("./models/group1-shard1of1.bin");
        setPosenetModel(await posenet.load({
          architecture: "MobileNetV1",
          outputStride: 16,
          multiplier: 0.5,
          inputResolution: tensorDims,
          quantBytes: 2
        }).then(model => {
          console.log("Posenet model loaded");
          return model;
        }));

        setFrameworkReady(true);
      })();
    }
  }, []);


  useEffect(() => {
    if (frameworkReady && imageAsTensors) {
      console.log("framework and camera ready");
      setRunning(true);
    }
  }, [frameworkReady, imageAsTensors]);

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
    if (!tensor || !posenetModel) return;

    // TENSORFLOW MAGIC HAPPENS HERE!
    const t0 = performance.now()
    const pose = await posenetModel.estimateSinglePose(tensor, { flipHorizontal: true })     // cannot have async function within tf.tidy
    if (!pose) {
      console.log("pose estimation error");
      return;
    }

    var numTensors = tf.memory().numTensors;
    setDebugText(`Tensors: ${numTensors}\nEstimation time: ${performance.now() - t0}\nPose:\n${JSON.stringify(pose)}`);
  }


  const loop = () => {
    // @ts-ignore
    const nextImageTensor = imageAsTensors.next().value;
    if (nextImageTensor) {
      getPrediction(nextImageTensor).then(() => {
        nextImageTensor.dispose();
        rafId.current = requestAnimationFrame(loop);
      })
    }
  }


  const handleCameraStream = (iat) => {
    console.log("Camera loaded")
    setImageAsTensors(iat);
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
      </View>
      <Button title="Log states" onPress={() => {
        console.log(`========================\nframeworkReady: ${frameworkReady}\nimageAsTensors: ${imageAsTensors ? "loaded" : "unloaded"}\nrunning: ${running}\nrafId: ${rafId.current}\n========================`);
      }} />
      <Button color={running ? "#ee5511" : "#33cc44"} title={`${running ? "Stop" : "Start"} animation`} onPress={() => setRunning(!running)} />
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
