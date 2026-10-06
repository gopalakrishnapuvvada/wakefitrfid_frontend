"""CoLa-A Command Builders for SICK SOPAS / RFU630."""

from uaim_device.adapters.sick_rfu630.cola.framing import encode_cola_a_telegram


class SickColaCommands:
    """Standard SOPAS CoLa-A command text generators."""

    # Common Variable Names
    VAR_DEVICE_IDENT = "DeviceIdent"
    VAR_DEVICE_STATE = "SCdevicestate"
    VAR_OP_HOURS = "OperatingHours"

    # Common Method Names
    METHOD_RUN = "Run"
    METHOD_FREEZE = "Freeze"
    METHOD_SET_ACCESS_MODE = "SetAccessMode"
    METHOD_REBOOT = "mEEreboot"
    METHOD_START_READ = "mEEstartread"
    METHOD_STOP_READ = "mEEstopread"

    # Tag Write & Memory Access Methods
    METHOD_WRITE_TAG_DATA = "TAwriteTagData"
    METHOD_EXT_WRITE_TAG_DATA = "TAextWriteTagData"

    @classmethod
    def read_variable(cls, var_name: str) -> bytes:
        """Create framed read command: <STX>sRN <var_name><ETX>"""
        return encode_cola_a_telegram(f"sRN {var_name}")

    @classmethod
    def write_variable(cls, var_name: str, value: str) -> bytes:
        """Create framed write command: <STX>sWN <var_name> <value><ETX>"""
        return encode_cola_a_telegram(f"sWN {var_name} {value}")

    @classmethod
    def invoke_method(cls, method_name: str, *args: str) -> bytes:
        """Create framed method invocation: <STX>sMN <method_name> [args...]<ETX>"""
        arg_str = f" {' '.join(args)}" if args else ""
        return encode_cola_a_telegram(f"sMN {method_name}{arg_str}")

    @classmethod
    def subscribe_event(cls, event_name: str, enable: bool = True) -> bytes:
        """Create framed event subscribe/unsubscribe command: <STX>sEN <event_name> <1|0><ETX>"""
        flag = "1" if enable else "0"
        return encode_cola_a_telegram(f"sEN {event_name} {flag}")

    @classmethod
    def device_ident(cls) -> bytes:
        return cls.read_variable(cls.VAR_DEVICE_IDENT)

    @classmethod
    def device_state(cls) -> bytes:
        return cls.read_variable(cls.VAR_DEVICE_STATE)

    @classmethod
    def run(cls) -> bytes:
        return cls.invoke_method(cls.METHOD_RUN)

    @classmethod
    def freeze(cls) -> bytes:
        return cls.invoke_method(cls.METHOD_FREEZE)

    @classmethod
    def build_write_tag_epc_cmd(
        cls,
        epc_hex: str,
        target_epc: str | None = None,
        memory_bank: int = 1,
        word_offset: int = 2,
        retries: int = 32,
        antenna_id: int = 1,
    ) -> str:
        """
        Build raw SICK CoLa-A command text for writing EPC/UII data to a transponder.
        
        SICK RFU630 Telegram format:
          Non-addressed: sMN TAextWriteTagData 0 0 <bank> <offset> <words> <retries> +<char_len> <data> <antenna>
          Addressed:     sMN TAextWriteTagData 2 +<target_len> <target_epc> <bank> <offset> <words> <retries> +<char_len> <data> <antenna>
        """
        clean_epc = "".join(c for c in epc_hex.strip() if c.isalnum()).upper()
        if len(clean_epc) % 4 != 0:
            pad_len = 4 - (len(clean_epc) % 4)
            clean_epc = clean_epc + ("0" * pad_len)

        words = len(clean_epc) // 4
        char_len = len(clean_epc)

        if target_epc and target_epc.strip():
            clean_target = "".join(c for c in target_epc.strip() if c.isalnum()).upper()
            selector = f"2 +{len(clean_target)} {clean_target}"
        else:
            selector = "0 0"

        return f"sMN {cls.METHOD_EXT_WRITE_TAG_DATA} {selector} {memory_bank} {word_offset} {words} {retries} +{char_len} {clean_epc} {antenna_id}"

    @classmethod
    def build_ext_write_tag_cmd(
        cls,
        epc_hex: str,
        target_epc: str | None = None,
        memory_bank: int = 1,
        word_offset: int = 2,
        retries: int = 32,
        antenna_id: int = 1,
    ) -> str:
        """Build extended write command: sMN TAextWriteTagData ..."""
        return cls.build_write_tag_epc_cmd(
            epc_hex=epc_hex,
            target_epc=target_epc,
            memory_bank=memory_bank,
            word_offset=word_offset,
            retries=retries,
            antenna_id=antenna_id,
        )

