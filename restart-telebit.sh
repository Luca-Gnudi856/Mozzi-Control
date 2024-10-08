#!/bin/bash

# Ensure the necessary environment variables are set
if [ -z "$XDG_RUNTIME_DIR" ]; then
    export XDG_RUNTIME_DIR=/run/user/$(id -u)
fi

# Add DBUS_SESSION_BUS_ADDRESS if it's missing
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
    export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
fi

# Restart the telebit-restart.service using systemctl --user
systemctl --user restart telebit-restart.service

# Check if the service restarted successfully
if [ $? -eq 0 ]; then
    echo "Telebit restarted successfully."
else
    echo "Failed to restart Telebit."
fi


