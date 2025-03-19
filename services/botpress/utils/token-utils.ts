/**
 * Utilidades para el manejo y estimación de tokens
 */
export class TokenUtils {
    // Aproximación de caracteres por token para diferentes modelos
    private static readonly CHARS_PER_TOKEN = {
      'gpt-3.5-turbo': 4,
      'gpt-4': 4,
      'claude-2': 3.5,
      'default': 4
    };
  
    /**
     * Estima el número de tokens en un texto
     * @param text Texto a analizar
     * @param model Modelo de lenguaje (opcional)
     * @returns Número estimado de tokens
     */
    public static estimateTokenCount(text: string, model: string = 'default'): number {

        if (!text) return 0;
      
        let charsPerToken: number;
        switch (model) {
            case 'gpt-3.5-turbo':
                charsPerToken = this.CHARS_PER_TOKEN["gpt-3.5-turbo"]
                break;
            case 'gpt-4':
                charsPerToken = this.CHARS_PER_TOKEN["gpt-4"]
                break;
            case 'claude-2':
                charsPerToken = this.CHARS_PER_TOKEN["claude-2"]
                break;
            default:
                charsPerToken = this.CHARS_PER_TOKEN["default"]
                break;
        }

        return Math.ceil(text.length / charsPerToken);
    }
  
    /**
     * Estima el número de tokens en un objeto JSON
     * @param obj Objeto a analizar
     * @param model Modelo de lenguaje (opcional)
     * @returns Número estimado de tokens
     */
    public static estimateJsonTokenCount(obj: any, model: string = 'default'): number {
      if (!obj) return 0;
      
      const json = JSON.stringify(obj);
      return this.estimateTokenCount(json, model);
    }
  
    /**
     * Trunca un texto para que no exceda un número máximo de tokens
     * @param text Texto a truncar
     * @param maxTokens Número máximo de tokens
     * @param model Modelo de lenguaje (opcional)
     * @returns Texto truncado
     */
    public static truncateToTokenLimit(text: string, maxTokens: number, model: string = 'default'): string {
      if (!text) return '';
      
      let charsPerToken: number;
      switch (model) {
          case 'gpt-3.5-turbo':
              charsPerToken = this.CHARS_PER_TOKEN["gpt-3.5-turbo"]
              break;
          case 'gpt-4':
              charsPerToken = this.CHARS_PER_TOKEN["gpt-4"]
              break;
          case 'claude-2':
              charsPerToken = this.CHARS_PER_TOKEN["claude-2"]
              break;
          default:
              charsPerToken = this.CHARS_PER_TOKEN["default"]
              break;
      }
      const maxChars = Math.floor(maxTokens * charsPerToken);
      
      if (text.length <= maxChars) {
        return text;
      }
      
      // Truncar y añadir indicador de truncamiento
      return text.substring(0, maxChars - 3) + '...';
    }
  
    /**
     * Calcula el costo aproximado de una solicitud basado en tokens
     * @param inputTokens Tokens de entrada
     * @param outputTokens Tokens de salida
     * @param model Modelo de lenguaje
     * @returns Costo aproximado en USD
     */
    public static calculateCost(inputTokens: number, outputTokens: number, model: string): number {
      // Precios por 1000 tokens (aproximados, pueden cambiar)
      const prices: Record<string, { input: number; output: number }> = {
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
        'gpt-4': { input: 0.03, output: 0.06 },
        'claude-2': { input: 0.008, output: 0.024 },
        'default': { input: 0.01, output: 0.02 }
      };
      
      const modelPrices = prices[model] || prices.default;
      
      const inputCost = (inputTokens / 1000) * modelPrices.input;
      const outputCost = (outputTokens / 1000) * modelPrices.output;
      
      return inputCost + outputCost;
    }
  }