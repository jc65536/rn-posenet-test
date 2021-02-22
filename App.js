import React, { useState, useEffect } from "react";
import { ActivityIndicator, Text, View, ScrollView, StyleSheet, Button, Platform, Dimensions } from "react-native";
import Constants from "expo-constants";

// camera
import { Camera } from "expo-camera";

// tensorflow
import * as tf from "@tensorflow/tfjs";
import * as posenet from "@tensorflow-models/posenet";
import { cameraWithTensors } from "@tensorflow/tfjs-react-native";

// canvas
import Canvas from "react-native-canvas";


export default function App() {

    //Tensorflow and Permissions
    const [posenetModel, setPosenetModel] = useState(null);
    const [frameworkReady, setFrameworkReady] = useState(false);

    const TensorCamera = cameraWithTensors(Camera);
    let requestAnimationFrameId = 0;

    //performance hacks (Platform dependent)
    const textureDims = { width: 1600, height: 1200 };
    const tensorDims = { width: 152, height: 200 };

    const [ctx, setCanvasContext] = useState(null);


    //-----------------------------
    // Run effect once
    // 1. Check camera permissions
    // 2. Initialize TensorFlow
    // 3. Load Posenet Model
    //-----------------------------
    useEffect(() => {
        if (!frameworkReady) {
            (async () => {

                //check permissions
                const { status } = await Camera.requestPermissionsAsync();
                console.log(`permissions status: ${status}`);

                //we must always wait for the Tensorflow API to be ready before any TF operation...
                await tf.ready();

                //load the mobilenet model and save it in state
                setPosenetModel(await posenet.load());
                console.log(posenetModel);

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
            cancelAnimationFrame(requestAnimationFrameId);
        };
    }, [requestAnimationFrameId]);


    const getPrediction = async (tensor) => {
        if (!tensor) return;

        // TENSORFLOW MAGIC HAPPENS HERE!
        const pose = await posenetModel.estimateSinglePose(tensor, 0.5, true, 16);
        if (pose === null) return;
        
        drawSkeleton(pose);
    }


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


    const handleCameraStream = (imageAsTensors) => {
        const loop = async () => {
            const nextImageTensor = await imageAsTensors.next().value;
            await getPrediction(nextImageTensor);
            requestAnimationFrameId = requestAnimationFrame(loop);
        };
        loop();
    }


    // https://js.tensorflow.org/api_react_native/0.2.1/#cameraWithTensors
    const renderCameraView = () => {
        return <View style={styles.cameraView}>
            <TensorCamera
                style={styles.camera}
                type={Camera.Constants.Type.front}
                zoom={0}
                cameraTextureHeight={textureDims.height}
                cameraTextureWidth={textureDims.width}
                resizeHeight={tensorDims.height}
                resizeWidth={tensorDims.width}
                resizeDepth={3}
                onReady={(imageAsTensors) => handleCameraStream(imageAsTensors)}
                autorender={true}
            />
        </View>;
    }


    const handleCanvas = (canvas) => {
        if (canvas === null) return;
        const ctx = canvas.getContext("2d");
        setCanvasContext(ctx);
    }


    return (
        <View style={styles.container}>
            <View style={styles.body}>
                {renderCameraView()}
                <Canvas ref={handleCanvas} style={styles.canvas} />
            </View>
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
    cameraView: {
        width: CAM_WIDTH,
        height: CAM_HEIGHT
    },
    camera: {
        width: "100%",
        height: "100%",
        zIndex: 1
    },
    canvas: {
        width: CAM_WIDTH,
        height: CAM_HEIGHT,
        zIndex: 2,
        position: "absolute"
    }
});



/////////////////////////////////////////////////////////////////////////////////////////////////////


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
            var type = value.split("|")[0];
            value = value.substr(type.length + 1);
            switch (type) {
                case "json":
                    value = JSON.parse(value);
                    break;
                case "boolean":
                    value = value === "true";
                    break;
                case "number":
                    value = Number(value);
                    break;
            }
            return value;
        }
    } catch (e) {
        // error reading value
        console.log("getData error: " + e.message);
    }
}