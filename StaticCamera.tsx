import React from "react";
import { StyleSheet, View } from "react-native";

// camera
import Constants from "expo-constants";
import { Camera } from "expo-camera";

// tensorflow
import { cameraWithTensors } from "@tensorflow/tfjs-react-native";

const TensorCamera = cameraWithTensors(Camera);

interface IStaticCameraProps {
  width: number,
  height: number,
  textureWidth: number,
  textureHeight: number,
  tensorWidth: number,
  tensorHeight: number,
  handler: any
}

class StaticCamera extends React.Component<IStaticCameraProps> {

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    (async () => {
      const { status } = await Camera.requestPermissionsAsync();
      console.log(`permissions status: ${status}`);
    })();
  }

  /*
  shouldComponentUpdate(nextProps, nextState) {
    return false;   // blocks all updates
  }
  */

  render() {
    return (
      <View style={this.styles.cameraView}>
        <TensorCamera style={this.styles.cameraView}
          type={Camera.Constants.Type.front}
          zoom={0}
          cameraTextureHeight={this.props.textureHeight}
          cameraTextureWidth={this.props.textureWidth}
          resizeHeight={this.props.tensorHeight}
          resizeWidth={this.props.tensorWidth}
          resizeDepth={3}
          onReady={this.props.handler}
          autorender={true}
        />
      </View>
    );
  }

  /*
  Type '{ style: { width: string; height: string; }; }' is missing the following properties from type
  'Readonly<ViewProps & { zoom?: number | undefined; ratio?: string | undefined; focusDepth?: number | undefined;
      type?: string | number | undefined; onCameraReady?: Function | undefined; ... 11 more ...; poster?: string | undefined; } & Props>':
      cameraTextureWidth, cameraTextureHeight, resizeWidth, resizeHeight, and 3 more.
  */

  styles = StyleSheet.create({
    cameraView: {
      width: this.props.width,
      height: this.props.height,
      zIndex: 0
    },
    camera: {
      width: "100%",
      height: "100%"
    }
  });

}

export default StaticCamera;
