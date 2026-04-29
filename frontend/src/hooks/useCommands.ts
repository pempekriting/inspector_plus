import { useExecuteCommand } from "../services/api";
import { useDeviceStore } from "../stores/deviceStore";

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export function useCommands() {
  const { selectedDevice } = useDeviceStore();
  const executeCommandMutation = useExecuteCommand();

  const executeCommand = async (
    type: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> => {
    try {
      const result = await executeCommandMutation.mutateAsync({
        type,
        params,
        udid: selectedDevice || undefined,
      });
      return result;
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  };

  return {
    executeCommand,
    isExecuting: executeCommandMutation.isPending,
  };
}
