from pyModbusTCP.client import ModbusClient
import math
import time

class ModbusClass:
    def Connect(self):
        IP_ADDRESS = '192.168.0.3'
        #IP_ADDRESS is the IP address of the LOGO!
        
        SERVER_PORT = 510
        
        self.c = ModbusClient()
        
        
        # define modbus server host, port
        self.c.host = IP_ADDRESS
        self.c.port = SERVER_PORT
        self.c.open()
        print("Execute the open function")
        
        # open or reconnect TCP to server
        if not self.c.is_open:
            print("unable to connect to"+IP_ADDRESS+":"+str(SERVER_PORT))
            
        # if open() is okay, read register (modbus function 0x03)
        if self.c.is_open:
            print("Connected Successfully")
            
    # Turning on a relay on Siemens Logo! 8
    def WriteSingleDigital(self, address, status):
        value = self.c.write_single_coil(address, status)
        
        if value:
            print("Written Successfully")
        else:
            print("Failed to write")
            
    def ReadSingleHoldingRegister(self, address):
        value = self.c.read_holding_registers(address)
        
        if value == None:
            print("failed to read")
        else:
            print("Read Successfully")
            return int(value[0])
        
    def WriteSingleHoldingRegister(self, address, val1):
        value = self.c.write_single_register(address,val1)
        if value == None:
            print("Failed to write")
        else:
            print("Written Successfully")
            
    def WriteMultipleRegisters(self, address, val1):
        value = self.c.write_multiple_registers(address, val1)
        if value == None:
            print("Failed to write")
        else:
            print("Written Successfully")
            
    def WriteSingleDoubleRegister(self, address, value):
        # Split the 32-bit value into two 16-bit registers
        high_word = (value >> 16) & 0xFFFF  # Most significant 16 bits
        low_word = value & 0xFFFF           # Least significant 16 bits

        # Write to two consecutive registers
        result = self.c.write_multiple_registers(address, [high_word, low_word])
    
        if result:
            print(f"Successfully wrote {value} to registers starting at address {address}")
        else:
            print(f"Failed to write {value} to registers starting at address {address}")