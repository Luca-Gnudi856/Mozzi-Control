const fss = require('fs').promises;
const fs = require('fs');
const path = require('path');

const express = require('express');
const connectionDir = '/etc/NetworkManager/system-connections/';
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const csv = require('csv-parser');


const PORT = 3000;

const app = express();

app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.urlencoded({ extended: true }));

// Serve the static HTML file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Function to read the current settings
async function readCurrentSettings(filePath) {
    try {
        const data = await fss.readFile(filePath, 'utf8');
        const settings = {};
        const lines = data.split('\n');
        for (const line of lines) {
            const [key, value] = line.split('=');
            if (key && value) {
                settings[key.trim()] = value.trim();
            }
        }
        return settings;
    } catch (err) {
        console.error('Error reading settings file:', err);
        return {};
    }
}

// Endpoint to fetch the current parameters
app.get('/getParameters', async (req, res) => {
    try {
        const currentSettings = await readCurrentSettings('setting.txt');
        res.json(currentSettings);
    } catch (err) {
        console.error('Failed to fetch settings:', err);
        res.status(500).send('Failed to retrieve settings.');
    }
});

app.get('/getControlParameters', async (req, res) => {
    try {
        const currentSettings = await readCurrentSettings('Control.txt');
        setControlParameters = currentSettings.mosquitoMode;
        res.json(currentSettings);
    } catch (err) {
        console.error('Failed to fetch control settings:', err);
        res.status(500).send('Failed to retrieve control settings.');
    }
});

// Function to write to file with exclusive access
async function writeToFileExclusive(filePath, data) {
    let fileHandle;
    try {
        // Open the file with write permissions and exclusive access
        fileHandle = await fss.open(filePath, 'w', 0o666);
       
        // Write the data to the file
        await fileHandle.writeFile(data);
        console.log('File written successfully');
    } catch (err) {
        throw err;
    } finally {
        // Close the file to release the lock
        if (fileHandle) {
            await fileHandle.close();
        }
    }
}

let setControlParameters;

app.post('/setMosquitoMode', async (req, res) => {
    const { MosquitoMode } = req.body;

    // Set the global variable
    setControlParameters = MosquitoMode;

    let status;

    if(setControlParameters === 'true'){
        status = 'activated';
    } else{
        status = 'deactivated'; 
    }

    try {
        console.log('set mode hit:', setControlParameters); 
        const newSettings=''; 
        const result = await setParametersInternal(newSettings);  // Use the shared internal function

        if (result.success) {
            return res.status(200).json({ message: `Mosquito Mode ${status} successfully!` }); // Send success message
        } else {
            throw new Error(`Failed to ${status} Mosquito Mode.`);  // Send error message
        }

        // if (!response.ok) {
        //     throw new Error(`Failed to ${status} Mosquito Mode.`);
        // }

        // return res.status(200).json({ message: `Mosquito Mode ${status} successfully!` });
    } catch (error) {
        console.error(`Error setting parameters: ${error.message}`);
        return res.status(500).json({ error: `Failed to ${status} Mosquito Mode.` });
    }
});

// Centralized function to update parameters
function updateAllParameters(currentSettings, newSettings) {
    
    if (newSettings.temperature !== undefined && newSettings.temperature !== '') {
      currentSettings.temperature = newSettings.temperature;
    }
  
    if (newSettings.humidity !== undefined && newSettings.humidity !== '') {
      currentSettings.humidity = newSettings.humidity;
    }
  
    if (newSettings.maxLighting !== undefined && newSettings.maxLighting !== '') {
      currentSettings.maxLighting = newSettings.maxLighting;
    }
  
    if (newSettings.dayLength !== undefined && newSettings.dayLength !== '') {
      currentSettings.dayLength = newSettings.dayLength;
    }
  
    if (newSettings.control !== undefined && newSettings.control !== '') {
      currentSettings.control = newSettings.control;
    }

    if (newSettings.minuteCount !== undefined && newSettings.minuteCount !== ''){
        currentSettings.minuteCount = newSettings.minuteCount;
    }

    if(newSettings.timeOn !== undefined && newSettings.timeOn !== ''){
        currentSettings.timeOn = newSettings.timeOn;
    }

    if(newSettings.timeOff !== undefined && newSettings.timeOff !== ''){
        currentSettings.timeOff = newSettings.timeOff;
    }
  
    return currentSettings;
  }

function formatSettingsString(settings) {
    // This function converts the settings object into the desired string format for the file
    return Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n');
}

async function setParametersInternal(newSettings) {
    let filePath;
    // Get the current timestamp
    //const currentTimestamp = new Date().toLocaleString(); 

    try {
        console.log('setinternal parameters control?', setControlParameters);
        if(setControlParameters === 'true'){

            filePath = 'Control.txt';
            
            let currentSettings = await readCurrentSettings(filePath);
            //console.log('newSettings for control',newSettings);
            currentSettings = updateAllParameters(currentSettings, newSettings);
            currentSettings.mosquitoMode = 'true';
            //currentSettings.lastUpdated = currentTimestamp;  
            
            //console.log('current Control.txt settings should read true:', currentSettings);
            const controlSettingsString = formatSettingsString(currentSettings);  // Format the control settings
            await writeToFileExclusive(filePath, controlSettingsString);  

            return { success: true, message: 'Parameters set successfully.' };

        } else {
            filePath = 'setting.txt';

            let currentSettings = await readCurrentSettings(filePath); 
            currentSettings = updateAllParameters(currentSettings, newSettings);
            //currentSettings.lastUpdated = currentTimestamp;  
            const settingsString = formatSettingsString(currentSettings);  // Format the settings as a string
            await writeToFileExclusive(filePath, settingsString);  // Write the formatted string to the file

            filePath = 'Control.txt';
            //newSettings = ''; //ensure that the other settings are not changed
            currentSettings = await readCurrentSettings(filePath);
           // currentSettings = updateAllParameters(currentSettings, newSettings);
            currentSettings.mosquitoMode = 'false';
            //currentSettings.lastUpdated = currentTimestamp;  
            //console.log('current setting.txt settings should read false: ', currentSettings);
            const controlSettingsString = formatSettingsString(currentSettings);  // Format the control settings
            await writeToFileExclusive(filePath, controlSettingsString);  

            return { success: true, message: 'Parameters set successfully.' };
           
        }
    } catch (err) {
        console.error('Failed to write to file:', err);
        return { success: false, message: 'Failed to set parameters.' };
    }
}

app.post('/setParameters', async (req, res) => {
    const newSettings = req.body; // New settings from the request

    const result = await setParametersInternal(newSettings);  // Use the shared internal function

    if (result.success) {
        return res.send(result.message);  // Send success message
    } else {
        return res.status(500).send(result.message);  // Send error message
    }
    
});

const MAX_RETRIES = 10;
const RETRY_INTERVAL = 1000; // 1 second retry interval

// Function to poll and read the CSV file
async function pollCsvFile(filePath, retries = MAX_RETRIES) {
    return new Promise((resolve, reject) => {
        let results = [];

        const attemptRead = (remainingRetries) => {
            const stream = fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    results.push(data);  // Collect all rows
                })
                .on('end', () => {
                    if (results.length > 0) {
                        resolve(results); // Resolve with all rows
                    } else {
                        reject(new Error('CSV file is empty'));
                    }
                })
                .on('error', (err) => {
                    if (remainingRetries > 0) {
                        console.warn(`Failed to read CSV. Retrying in ${RETRY_INTERVAL / 1000} seconds... (${remainingRetries} retries left)`);
                        setTimeout(() => attemptRead(remainingRetries - 1), RETRY_INTERVAL);
                    } else {
                        console.error('Failed to read CSV after maximum retries:', err);
                        reject(err);
                    }
                });
        };

        attemptRead(retries);
    });
}

// Endpoint to get data from CSV file with optional time filtering
app.get('/data', async (req, res) => {
    const { start, end } = req.query;

    try {
        // Poll the CSV file to get all the rows
        const results = await pollCsvFile('data.csv');
        let filteredResults = results;

        // Filter by start time if provided
        if (start) {
            const startTime = new Date(start);
            filteredResults = filteredResults.filter(row => new Date(row.Time) >= startTime);
        }

        // Filter by end time if provided
        if (end) {
            const endTime = new Date(end);
            filteredResults = filteredResults.filter(row => new Date(row.Time) <= endTime);
        }

        // Log and send the filtered results
        // console.log("Datasets from CSV:");
        // results.forEach((row, index) => {
        //     console.log(`Row ${index + 1}: Time: ${row.Time}, Temperature: ${row.Temperature}, Humidity: ${row.Humidity}, Lighting: ${row.Lighting}`);
        // });

        // console.log("Datasets from filtered CSV:");
        // filteredResults.forEach((row, index) => {
        //     console.log(`Row ${index + 1}: Time: ${row.Time}, Temperature: ${row.Temperature}, Humidity: ${row.Humidity}, Lighting: ${row.Lighting}`);
        // });

        res.json(filteredResults);
    } catch (err) {
        console.error('Error reading the CSV file:', err);
        res.status(500).send('Error reading the CSV file after retries');
    }
});

// Endpoint for downloading full CSV
app.get('/download/full', (req, res) => {
    const filePath = 'data.csv';

    res.setHeader('Content-Disposition', 'attachment; filename=data.csv');
    res.setHeader('Content-Type', 'text/csv');
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
});


async function pollCsvFileForConditions(filePath, retries = MAX_RETRIES) {
    return new Promise((resolve, reject) => {
        let results = [];

        const attemptRead = (remainingRetries) => {
            const stream = fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    results.push(data);  // Collect all rows
                })
                .on('end', () => {
                    if (results.length > 0) {
                        // Resolve with the last row (most recent)
                        resolve(results[results.length - 1]);
                    } else {
                        reject(new Error('CSV file is empty'));
                    }
                })
                .on('error', (err) => {
                    if (remainingRetries > 0) {
                        console.warn(`Failed to read CSV. Retrying in ${RETRY_INTERVAL / 1000} seconds... (${remainingRetries} retries left)`);
                        setTimeout(() => attemptRead(remainingRetries - 1), RETRY_INTERVAL);
                    } else {
                        console.error('Failed to read CSV after maximum retries:', err);
                        reject(err);
                    }
                });
        };

        attemptRead(retries);
    });
}

// Route to fetch the most recent conditions from the CSV file
app.get('/conditions', async (req, res) => {
    try {
        // Poll the CSV file for the latest row
        const latestData = await pollCsvFileForConditions('data.csv');
        //console.log('fetched data:', latestData);
        
        // Destructure the latest row to extract temperature, humidity, and lighting
        const { Temperature: temperature, Humidity: humidity, Lighting: lighting } = latestData;

        // Send the latest conditions as JSON
        res.json({ temperature, humidity, lighting });
    } catch (err) {
        console.error('Failed to fetch conditions from CSV:', err);
        res.status(500).send('Failed to fetch conditions from CSV.');
    }
});

// Endpoint to get the current active network and its priority
app.get('/currentNetwork', (req, res) => {
    // Use nmcli to get the active network
    exec('nmcli -t -f ACTIVE,SSID dev wifi', (err, stdout, stderr) => {
        if (err || stderr) {
            return res.status(500).send('Error getting current network.');
        }

        // Parse the output to find the active network (line with 'yes')
        const activeNetwork = stdout
            .split('\n')
            .find(line => line.startsWith('yes:'));

        if (activeNetwork) {
            const currentSSID = activeNetwork.split(':')[1];  // Extract the SSID

            // Path to the .nmconnection file for the active SSID
            const connectionFile = path.join(connectionDir, `${currentSSID}.nmconnection`);

            // Check if the file exists and read the priority from it
            if (fs.existsSync(connectionFile)) {
                // Read the file to get the priority value
                fs.readFile(connectionFile, 'utf8', (err, data) => {
                    if (err) {
                        return res.status(500).send('Error reading connection file.');
                    }

                    // Extract the 'priority' from the file content
                    const priorityMatch = data.match(/priority=(\d+)/);
                    const priority = priorityMatch ? priorityMatch[1] : 'Not set';

                    // Send both SSID and priority as the response
                    return res.json({ currentNetwork: currentSSID, priority: priority });
                });
            } else {
                // No .nmconnection file found for this SSID, return priority as "Unknown"
                return res.json({ currentNetwork: currentSSID, priority: 'Unknown' });
            }
        } else {
            // No active network found
            return res.json({ currentNetwork: null, priority: 'N/A' });
        }
    });
});


// Endpoint to get the list of available networks
app.get('/networks', (req, res) => {
    exec('sudo nmcli -t -f SSID device wifi list', (err, stdout, stderr) => {
        if (err) {
            res.status(500).send('Error scanning for networks');
            return;
        }

        // Extract network names (SSIDs)
        const networks = stdout
            .split('\n')
            .filter(ssid => ssid.trim() !== ''); // Filter out empty lines

        res.json(networks);
    });
});


// Endpoint to get the list of saved available networks
app.get('/savedAvailableNetworks', (req, res) => {
    // Fetch currently available networks
    exec('sudo nmcli -t -f SSID device wifi list', (err, stdout, stderr) => {
        if (err || stderr) {
            return res.status(500).send('Error scanning for networks');
        }

        // Get the list of available networks
        const availableNetworks = stdout
            .split('\n')
            .filter(ssid => ssid.trim() !== '');

        // Read the list of saved networks (i.e., .nmconnection files)
        fs.readdir(connectionDir, (err, files) => {
            if (err) {
                return res.status(500).send('Error reading saved connections');
            }

            // Filter the .nmconnection files to get the saved networks
            const savedNetworks = files
                .filter(file => file.endsWith('.nmconnection'))
                .map(file => path.basename(file, '.nmconnection')); // Get just the SSID (file name without extension)

            // Cross-reference saved networks with available networks
            const savedAvailableNetworks = savedNetworks.filter(ssid => availableNetworks.includes(ssid));

            // Return the cross-referenced saved available networks
            res.json(savedAvailableNetworks);
        });
    });
});

// UUID generator function
let connectionInProgress = null;
let connectionStatus = 'idle';
let lastConnectionError = '';


app.post('/connect', (req, res) => {
    if (connectionInProgress) {
        return res.status(409).send('Connection attempt already in progress.');
    }

    connectionInProgress = true;
    connectionStatus = 'in_progress';
    const { ssid, username, password, priority } = req.body;

    console.log(`Received request to connect to SSID: ${ssid}, with priority: ${priority}`);
    lastConnectionError = '';  // Clear the last error

    const uuid = generateUUID();
    const fileName = `${ssid}.nmconnection`;

    let nmConfig = `
[connection]
id=${ssid}
uuid=${uuid}
type=wifi
autoconnect-priority=${priority}
interface-name=wlan0

[wifi]
mode=infrastructure
ssid=${ssid}

[wifi-security]
key-mgmt=${username ? 'wpa-eap' : 'wpa-psk'}
`;

    if (username) {
        nmConfig += `
[802-1x]
eap=peap
identity=${username}
password=${password}
phase2-auth=mschapv2
`;
    } else {
        nmConfig += `
psk=${password}
`;
    }

    nmConfig += `
[ipv4]
method=auto

[ipv6]
method=auto
`;

    // Write the .nmconnection file
    fs.writeFileSync(`${connectionDir}${fileName}`, nmConfig, { mode: 0o600 });

    // Restart NetworkManager
    exec('sudo systemctl restart NetworkManager', (err, stdout, stderr) => {
        if (err) {
            console.error('Failed to restart NetworkManager:', stderr);
            connectionStatus = 'failed';
            lastConnectionError = 'Failed to restart NetworkManager.';
            connectionInProgress = false;
            return;
        }

        let attempts = 0;
        const maxAttempts = 50;
        const checkInterval = 1000;

        console.log("Starting connection check...");
        const checkConnection = setInterval(() => {
            exec('nmcli -t -f ACTIVE,SSID dev wifi', (err, stdout, stderr) => {
                if (err) {
                    console.error('Error checking connection status:', stderr);
                    connectionStatus = 'failed';
                    lastConnectionError = 'Failed to check connection status.';
                    connectionInProgress = false;
                    clearInterval(checkConnection);
                    return;
                }

                const activeNetwork = stdout.split('\n').find(line => line.startsWith('yes:'))?.split(':')[1] || 'None';
                console.log(`Attempt ${attempts + 1}: Active network is: ${activeNetwork}`);

                if (activeNetwork !== 'None') {
                    if (activeNetwork !== ssid) {
                        // If connected to a different network, attempt to connect to the correct one
                        console.log(`Connected to ${activeNetwork} instead of ${ssid}, attempting to reconnect...`);
                        exec(`sudo nmcli connection up "${ssid}"`, (err, stdout, stderr) => {
                            if (err || stderr) {
                                if (stderr.includes('Secrets were required') || stderr.includes('No key available')) {
                                    console.log('Incorrect password');
                                    connectionStatus = 'failed';
                                    lastConnectionError = 'Incorrect password.';
                                } else {
                                    console.log(`Reconnection attempt to ${ssid} failed: ${stderr}`);
                                    connectionStatus = 'failed';
                                    lastConnectionError = `Failed to connect to ${ssid}.`;
                                }
                                connectionInProgress = false;
                            } else if (stdout.includes('successfully activated')) {
                                console.log(`Successfully reconnected to ${ssid}`);
                                connectionStatus = 'connected';
                                handleGatewayUpdate(); // Update gateway after reconnection
                                connectionInProgress = false;
                            }
                        });
                    } else {
                        console.log(`Successfully connected to ${ssid}`);
                        connectionStatus = 'connected';
                        handleGatewayUpdate(); // Update gateway after reconnection
                        connectionInProgress = false;
                    }
                    clearInterval(checkConnection);
                    return;
                }

                if (++attempts >= maxAttempts) {
                    // If max attempts are reached, attempt to connect using "nmcli connection up"
                    console.log(`Max attempts reached. Attempting to force connection to ${ssid}...`);
                    exec(`sudo nmcli connection up "${ssid}"`, (err, stdout, stderr) => {
                        if (err || stderr) {
                            if (stderr.includes('Secrets were required') || stderr.includes('No key available')) {
                                console.log('Incorrect password');
                                connectionStatus = 'failed';
                                lastConnectionError = 'Incorrect password.';
                            } else {
                                console.log(`Final attempt to ${ssid} failed: ${stderr}`);
                                connectionStatus = 'failed';
                                lastConnectionError = `Failed to connect to ${ssid} after max attempts.`;
                            }
                        } else if (stdout.includes('successfully activated')) {
                            console.log(`Successfully connected to ${ssid} after max attempts`);
                            connectionStatus = 'connected';
                            handleGatewayUpdate(); // Update gateway after reconnection
                        }
                        connectionInProgress = false;
                    });
                    clearInterval(checkConnection);
                }
            });
        }, checkInterval);
    });
});


function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Endpoint to handle connecting to saved networks
app.post('/connectSaved', (req, res) => {
    const { ssid } = req.body;
    const fileName = `${connectionDir}${ssid}.nmconnection`;

    // Check if the connection file exists
    if (!fs.existsSync(fileName)) {
        connectionStatus = 'failed';
        lastConnectionError = `Connection file for ${ssid} not found.`;
        return res.status(404).send(lastConnectionError);
    }

    // Set status to in progress
    connectionInProgress = true;
    connectionStatus = 'in_progress';

    // Attempt to bring the connection up
    exec(`sudo nmcli connection up "${ssid}"`, (err, stdout, stderr) => {
        connectionInProgress = false;  // Clear the progress flag after attempt
        
        if (err || stderr) {
            if (stderr.includes('Secrets were required') || stderr.includes('No key available')) {
                connectionStatus = 'failed';
                lastConnectionError = 'Incorrect password.';
                console.log(`Incorrect password for ${ssid}`);
                return res.status(401).send(lastConnectionError);
            }

            connectionStatus = 'failed';
            lastConnectionError = `Error connecting to ${ssid}: ${stderr}`;
            console.log(lastConnectionError);
            return res.status(500).send(lastConnectionError);
        }

        if (stdout.includes('successfully activated')) {
            connectionStatus = 'connected';
            console.log(`Successfully connected to ${ssid}`);
            lastConnectionError = '';
            handleGatewayUpdate();  // Call your existing gateway update logic
            return res.send(`Successfully connected to ${ssid}`);
        } else {
            connectionStatus = 'failed';
            lastConnectionError = `Connection failed for ${ssid}`;
            console.log(lastConnectionError);
            return res.status(500).send(lastConnectionError);
        }
    });
});


// Add a new status endpoint to check connection progress
app.get('/status', (req, res) => {
    console.log("status hit");
    if (connectionInProgress) {
        return res.status(200).send({ status: 'in_progress' });
    }

    if (connectionStatus === 'connected') {
        console.log("status connected");
        return res.status(200).send({ status: 'connected' });
    } else if (connectionStatus === 'failed') {
        console.log("status lastconnection error:",lastConnectionError);
        return res.status(500).send({ status: 'failed', error: lastConnectionError });
    } else if(connectionInProgress === true){
        return res.status(200).send({ status: `Connection to ${ssid} in progress...` } );
    } else {
        return res.status(200).send({ status: 'idle' });
    }
});

let currentGateway;

// Function to execute shell commands and return the result
function executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(`Error: ${stderr}`);
        } else {
          resolve(stdout.trim());
        }
      });
    });
}

function getWlan0Route() {
    return executeCommand('ip route show default dev wlan0')
      .then(route => {
        if (!route) {
          throw new Error('No route information found for wlan0');
        }
  
        const routeParts = route.split(' ');  // Split the route string by spaces
        const gatewayIndex = routeParts.indexOf('via') + 1; // Find the index of 'via' and get the next part
        const gatewayIP = routeParts[gatewayIndex];
  
        if (!gatewayIP) {
          throw new Error('Gateway IP not found in the route information');
        }
  
        return gatewayIP;
      })
      .catch(err => {
        console.error('Failed to find default gateway for wlan0:', err);
        return null;
      });
  }
  
  // Function to update the default gateway
  async function updateGateway(gatewayIP) {
    try {
      const updateCmd = `sudo ip route add default via ${gatewayIP} dev wlan0`;
      console.log(`Executing: ${updateCmd}`);
      await executeCommand(updateCmd);
      console.log('Gateway updated successfully');
    } catch (err) {
      console.error('Failed to update gateway:', err);
    }
  }
  
  // Function to handle updating the gateway once connected
  async function handleGatewayUpdate() {
    try {
      const wlan0Gateway = await getWlan0Route();
      if (wlan0Gateway) {
        console.log(`Updating default gateway to: ${wlan0Gateway}`);
        await updateGateway(wlan0Gateway);
        currentGateway = wlan0Gateway;
      }
    } catch (err) {
      console.error('Error during gateway update:', err);
    }
  }
  
  // Function to check and update the gateway if it has changed
function checkAndUpdateGateway() {
    getWlan0Route().then(newGateway => {
      if (!newGateway) {
        console.error('New gateway is undefined. Cannot update the gateway.');
        return;
      }
  
      if (currentGateway !== newGateway) {
        console.log(`Gateway is different. Updating to new gateway: ${newGateway}`);
        return updateGateway(newGateway).then(() => {
          console.log(`Successfully updated gateway to ${newGateway}`);
          currentGateway = newGateway; // Update the current gateway after successful update
        }).catch(err => {
          console.error('Failed to update gateway:', err);
        });
      } else {
        console.log('Gateway is correct. No update needed.');
      }
    }).catch(err => {
      console.error('Failed to get the current gateway:', err);
    });
  }
  
  // Function to start monitoring the gateway every 5 minutes
  function startGatewayMonitoring() {
    console.log('Starting gateway monitoring. Checking every 5 minutes...');
    checkAndUpdateGateway(); // Initial check
    setInterval(checkAndUpdateGateway, 5 * 60 * 1000); // Check every 5 minutes
  }
  
  // Start monitoring
  startGatewayMonitoring();
  
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});