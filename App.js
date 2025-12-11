import { NavigationContainer } from "@react-navigation/native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { StatusBar } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"

import DashboardScreen from "./src/screens/DashboardScreen"
import DiagnosticScreen from "./src/screens/DiagnosticScreen"
import PredictionScreen from "./src/screens/PredictionScreen"
import SettingsScreen from "./src/screens/SettingsScreen"

const Tab = createBottomTabNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName
            switch (route.name) {
              case "Dashboard":
                iconName = focused ? "view-dashboard" : "view-dashboard-outline"
                break
              case "Diagnostic":
                iconName = focused ? "camera" : "camera-outline"
                break
              case "Prevision":
                iconName = focused ? "chart-line" : "chart-line-variant"
                break
              case "Parametres":
                iconName = focused ? "cog" : "cog-outline"
                break
              default:
                iconName = "circle"
            }
            return <MaterialCommunityIcons name={iconName} size={size} color={color} />
          },
          tabBarActiveTintColor: "#2563EB",
          tabBarInactiveTintColor: "#9CA3AF",
          tabBarStyle: {
            height: 60,
            paddingBottom: 6,
            paddingTop: 6,
            backgroundColor: "#FFFFFF",
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
            elevation: 8,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          headerStyle: {
            backgroundColor: "#FFFFFF",
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          },
          headerTitleStyle: {
            fontWeight: "bold",
            fontSize: 18,
            color: "#1F2937",
          },
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: "Accueil",
            headerTitle: "FientesIA",
          }}
        />
        <Tab.Screen
          name="Diagnostic"
          component={DiagnosticScreen}
          options={{
            title: "Diagnostic",
            headerTitle: "Diagnostic",
          }}
        />
        <Tab.Screen
          name="Prevision"
          component={PredictionScreen}
          options={{
            title: "Prevision",
            headerTitle: "Prevision",
          }}
        />
        <Tab.Screen
          name="Parametres"
          component={SettingsScreen}
          options={{
            title: "Reglages",
            headerTitle: "Reglages",
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
