import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet, Text, View, Button, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BottomNavigation, Drawer, Avatar, IconToggle, Toolbar } from "react-native-material-ui";

class App extends React.Component {

    state = {
        active: ""
    }

    render() {
        return (
            <View>
                <Toolbar
                    leftElement="menu"
                    centerElement="Searchable"
                    searchable={{
                        autoFocus: true,
                        placeholder: 'Search',
                    }}
                    rightElement={{
                        menu: {
                            icon: "more-vert",
                            labels: ["item 1", "item 2"]
                        }
                    }}
                    onRightElementPress={(label) => { console.log(label) }}
                    style={{
                        fontSize: 2
                    }}
                />

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <TextInput placeholder={"Course Goal"} style={{ width: "80%", borderBottomColor: "black", borderWidth: 0.5, padding: 10 }} />
                    <View>
                        <IconToggle name="person" />
                    </View>
                </View>
                <View>
                    <Button title={"Save Data"} onPress={buttonClick} />
                    <TextInput>Hello World</TextInput>
                </View>
                <BottomNavigation active={this.state.active} hidden={false} >
                    <BottomNavigation.Action
                        key="today"
                        icon="today"
                        label="Today"
                        onPress={() => this.setState({ active: "today" })}
                    />
                    <BottomNavigation.Action
                        key="people"
                        icon="people"
                        label="People"
                        onPress={() => this.setState({ active: "people" })}
                    />
                    <BottomNavigation.Action
                        key="bookmark-border"
                        icon="bookmark-border"
                        label="Bookmark"
                        onPress={() => this.setState({ active: "bookmark-border" })}
                    />
                    <BottomNavigation.Action
                        key="settings"
                        icon="settings"
                        label="Settings"
                        onPress={() => this.setState({ active: "settings" })}
                    />
                </BottomNavigation>


            </View>
        );
    }
}

export default App;

const styles = StyleSheet.create({});
var k = true;
function buttonClick() {
    if (k) {
        var r = Math.random();
        storeData("key", r);
        console.log(r);
    } else {
        (async () => {
            alert(await getData("key"));
        })()
    }
    k = !k;
}

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