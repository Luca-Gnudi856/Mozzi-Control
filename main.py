from modbus import ModbusClass
import time
import csv
from datetime import datetime
import os
import platform

# Import the appropriate locking library based on the OS
if platform.system() == 'Windows':
    import msvcrt
else:
    import fcntl

md = ModbusClass()
md.Connect()

csv_file = 'data.csv'
settings_file = 'setting.txt'
custom_file = 'Custom.csv'

def writeDuration(value):
    md.WriteSingleDigital(8256, 1)
    md.WriteSingleHoldingRegister(528, value)
    
def writeIntensity(value):
    md.WriteSingleDigital(8257, 1)
    md.WriteSingleHoldingRegister(529, value)
    
def writeLight(value):
    md.WriteSingleDoubleRegister(2, value)
    
def writeTemperature(value):
    temp = int(value*10+500)
    md.WriteSingleDigital(8258,1)
    md.WriteSingleHoldingRegister(530, temp)
    
def writeHumidity(value):
    humid = int((value*25.68 + 1079)/10)
    md.WriteSingleDigital(8259,1)
    md.WriteSingleHoldingRegister(531, humid)
    
def writeCount(value):
    md.WriteSingleDoubleRegister(1, value)
    
def writeTime(address, value):
    md.WriteSingleDoubleRegister(address, value)
    
def readTemperature():
    return md.ReadSingleHoldingRegister(534)

def readHumidity():
    return md.ReadSingleHoldingRegister(533)

def readLight():
    return md.ReadSingleHoldingRegister(532)

def lock_file(file):
    if platform.system() == 'Windows':
        # Lock the file on Windows
        msvcrt.locking(file.fileno(), msvcrt.LK_LOCK, os.path.getsize(csv_file))
    else:
        # Lock the file on Unix-based systems
        fcntl.flock(file, fcntl.LOCK_EX)

# Function to unlock the file
def unlock_file(file):
    if platform.system() == 'Windows':
        # Unlock the file on Windows
        msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, os.path.getsize(csv_file))
    else:
        # Unlock the file on Unix-based systems
        fcntl.flock(file, fcntl.LOCK_UN)

def read_settings():
    max_retries = 50  # Maximum number of retries if the file is locked
    retry_delay = 2  # Delay between retries (in seconds)

    retries = 0
    while retries < max_retries:
        try:
            # Attempt to open the settings file
            with open(settings_file, 'r') as file:
                lines = file.readlines()

            # Parse the settings as usual
            temp1, humid1, light1, dayLight1, sample1, mode1, count1, timeOn, timeOff = [
                line.strip().split(',')[0] for line in lines[:9]
            ]

            temp1 = int(temp1.split("=")[1])
            humid1 = int(humid1.split("=")[1])
            light1 = int(light1.split("=")[1])
            dayLight1 = int(dayLight1.split("=")[1])
            sample1 = int(sample1.split("=")[1])
            mode1 = mode1.split("=")[1]
            count1 = int(count1.split("=")[1])
            timeOn = timeOn.split("=")[1]
            timeOff = timeOff.split("=")[1]

            # Time conversion logic (to Modbus format)
            hour, minute = map(int, timeOn.split(":"))
            StartTime = (hour << 8) | minute  # Combine hour and minute into 16-bit word

            hour, minute = map(int, timeOff.split(":"))
            EndTime = (hour << 8) | minute  # Combine hour and minute into 16-bit word

            return temp1, humid1, light1, dayLight1, sample1, mode1, count1, timeOn, timeOff, StartTime, EndTime

        except (OSError, IOError) as e:
            # If the file is locked or access is denied, handle the exception
            print(f"Could not access {settings_file} (attempt {retries + 1}/{max_retries}). Retrying in {retry_delay} seconds...")
            retries += 1
            time.sleep(retry_delay)

    # If the maximum retries are exceeded, raise an error or return a fallback value
    raise TimeoutError(f"Could not access {settings_file} after {max_retries} retries.")

# Initialize previous values to None (since nothing has been written yet)
prev_temp = None
prev_humid = None
prev_light = None
prev_daylight = None
prev_sample = None
prev_count = None
prev_Ton = None
prev_Toff = None

# Initialize the modification time
last_mod_time = os.path.getmtime(settings_file)

try:
    with open(csv_file, 'x', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['Timestamp', 'Temperature', 'Humidity', 'Light'])
except FileExistsError:
    pass  # File already exists, so no need to write headers again
   
try:
    # Read the initial settings
    temp1, humid1, light1, dayLight1, sample1, mode1, count1, timeOn, timeOff, StartTime, EndTime = read_settings()
    
    while md.c.is_open:  # Continue the loop while the Modbus connection is open
        # Check if settings.txt has been modified
        current_mod_time = os.path.getmtime(settings_file)
        if current_mod_time != last_mod_time:
            # If modified, read the new settings
            print("Detected changes in settings.txt, updating settings.")
            temp1, humid1, light1, dayLight1, sample1, mode1, count1, timeOn, timeOff, StartTime, EndTime = read_settings()
            
            # Only write to the Modbus if the value has changed
            if temp1 != prev_temp:
                print(f"Writing new temperature: {temp1}")
                writeTemperature(temp1)
                prev_temp = temp1

            if humid1 != prev_humid:
                print(f"Writing new humidity: {humid1}")
                writeHumidity(humid1)
                prev_humid = humid1

            if light1 != prev_light:
                print(f"Writing new light intensity: {light1}")
                writeIntensity(light1)
                prev_light = light1

            if dayLight1 != prev_daylight:
                print(f"Writing new daylight duration: {dayLight1}")
                writeDuration(dayLight1)
                prev_daylight = dayLight1
                
            if sample1 != prev_sample:
                print(f"Writing new sample duration: {sample1}")
                prev_sample = sample1
                
            if count1 != prev_count:
                print(f"Writing new minute count: {count1}")
                writeCount(count1)
                prev_count = count1
                
            if timeOn != prev_Ton:
                print(f"Writing new start time: {timeOn}")
                writeTime(3, StartTime)
                prev_Ton = timeOn
                
            if timeOff != prev_Toff:
                print(f"Writing new end time: {timeOff} ")
                writeTime(4, EndTime)
                prev_Toff = timeOff
                
            last_mod_time = current_mod_time
            
        print(mode1)
        print(temp1)
        print(humid1)
        print(light1)
        print(dayLight1)
        print(sample1)
        print(count1)
        print(timeOn)
        print(timeOff)
        
        if mode1 == "Default":
            md.WriteSingleDigital(8260,0) #Flag to switch between default and other modes
        
            temp = readTemperature()/10
            humid = readHumidity()
            light = readLight() 
        
            print(f"Temperature: {temp} °C")
            print(f"Humidity: {humid}%")
            print(f"Light intensity: {light}")
        
            # Get the current timestamp
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
            # Append the new data to the CSV file
            with open(csv_file, 'a', newline='') as file:
                # Lock the file before writing 
                lock_file(file)
            
                writer = csv.writer(file)
                writer.writerow([timestamp, temp, humid, light])
            
                # Unlock the file after writing
                unlock_file(file)
        
            time.sleep(sample1*60)
        
        elif mode1 == "Constant":
            md.WriteSingleDigital(8260,1) #Flag to switch between default and other modes
            
            writeLight(light1)

            temp = readTemperature()/10
            humid = readHumidity()
            light = readLight() 
        
            print(f"Temperature: {temp} °C")
            print(f"Humidity: {humid}%")
            print(f"Light intensity: {light}")
        
            # Get the current timestamp
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
            # Append the new data to the CSV file
            with open(csv_file, 'a', newline='') as file:
                # Lock the file before writing
                lock_file(file)
            
                writer = csv.writer(file)
                writer.writerow([timestamp, temp, humid, light])
            
                # Unlock the file after writing
                unlock_file(file)
        
            time.sleep(sample1*60)
        
        elif mode1 == "Custom":
            md.WriteSingleDigital(8260,1) #Flag to switch between default and other modes
            
            # Read the CSV data to dynamically change output over time
            with open(custom_file, newline='') as file:
                reader = csv.DictReader(file)
                for row in reader:
                    
                    temp1, humid1, light1, dayLight1, sample1, mode1, count1, timeOn, timeOff, StartTime, EndTime = read_settings()
                    if mode1 != "Custom":
                        break
                    
                    time_min = int(row['Time (min)'])  # Read the 'Time (min)' column
                    output_value = int(row['Output'])  # Read the 'Output' column

                    # Adjust the light based on the output value
                    print(f"At minute {time_min}, writing light intensity: {output_value}")
                    writeLight(output_value)  # Use the value from CSV to adjust light

                    temp = readTemperature() / 10
                    humid = readHumidity()
                    light = readLight()

                    print(f"Temperature: {temp} °C")
                    print(f"Humidity: {humid}%")
                    print(f"Light intensity: {light}")

                    # Get the current timestamp
                    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

                    # Append the new data to the CSV file
                    with open(csv_file, 'a', newline='') as file:
                        # Lock the file before writing
                        lock_file(file)

                        writer = csv.writer(file)
                        writer.writerow([timestamp, temp, humid, light])

                        # Unlock the file after writing
                        unlock_file(file)

                    # Wait for the time corresponding to the CSV data (simulating time in minutes)
                    time.sleep(sample1*60)  # Sleep for 60 seconds to simulate one minute in the CSV
            
except KeyboardInterrupt:
    # Handle keyboard interrupt (Ctrl+C) to gracefully close the connection
    print("Keyboard interrupt detected. Closing Modbus connection.")
    md.c.close()
    print("Modbus connection closed.")