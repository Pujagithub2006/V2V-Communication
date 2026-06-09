// Factory function for creating and publishing schema/ status of each vehicle

export function vehicleStatus(vehicleId) {
    return {
        vehicleId,

        position: {
            latitude: 0,
            longitude: 0
        },

        motion: {
            speed: 0,
            acceleration: 0,
            heading: 0
        },

        controls: {
            brakeStatus: false,
            steeringAngle: 0,
            transmissionState: "Park"
        },

        status: {
            vehicleStatus: "Stable",
            online: false
        },

        telemetry: {
            lastSeen: Date.now()
        }
        
    };
} 