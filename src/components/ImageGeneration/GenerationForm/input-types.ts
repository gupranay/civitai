type BaseInputProps = {
  name: string;
  label: string;
  required?: boolean;
  info?: string;
  advanced?: boolean;
  hidden?: boolean;
};

type ResourceSelectInputProps = BaseInputProps & {
  type: 'resource-select';
  multiple?: boolean;
  value?: { air: string; strength?: number; trainedWords?: string[] }[];
};

type TextAreaInputProps = BaseInputProps & {
  type: 'textarea';
  value?: string;
  placeholder?: string;
};

type TextInputProps = BaseInputProps & {
  type: 'text';
  value?: string;
  placeholder?: string;
};

type AspectRatioInputProps = BaseInputProps & {
  type: 'aspect-ratio';
  value?: string;
  options: { label: string; width: number; height: number }[];
};

type SwitchInputProps = BaseInputProps & {
  type: 'switch';
  checked?: boolean;
};

type NumberSliderInputProps = BaseInputProps & {
  type: 'number-slider';
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  reverse?: boolean;
  presets?: { label: string; value: number }[];
};

type SelectInputProps = BaseInputProps & {
  type: 'select';
  value?: string;
  options: string[] | { label: string; value: string }[];
  presets?: { label: string; value: string }[];
};

type SeedInputProps = BaseInputProps & {
  type: 'seed';
  value?: number;
  min?: number;
  max?: number;
};

export type GeneratorInputProps =
  | ResourceSelectInputProps
  | TextAreaInputProps
  | TextInputProps
  | AspectRatioInputProps
  | SwitchInputProps
  | NumberSliderInputProps
  | SelectInputProps
  | SeedInputProps;

type GenerationConfigGroup = {
  id: number;
  type: 'image' | 'video';
  name: string; // ie. Text to Image, Image to Image, Flux
  modelId?: number;
  baseModel: string; // ie. SD1, SDXL, Pony
};

type BaseGenerationConfig = {
  id: number; // workflow id would map to a recipe/$type
  type: 'image' | 'video';
  name: string; // ie. Face fix
  description?: string;
  batchSize?: number;
  tag?: string; // 'txt2img' | 'img2img' | 'flux' | ''
};

type Test = {
  type: 'image';
  subType: 'txt2img' | 'img2img';
};

type Tes2 = {
  type: 'video';
  subType: 'txt2vid' | 'img2vid';
};

type GenerationModelConfig = BaseGenerationConfig & {
  category: 'model';
  modelId?: number;
  baseModel: string; // ie. SD1, SDXL, Pony
};

type GenerationServiceConfig = BaseGenerationConfig & {
  category: 'service';
  engine: string;
};

type GenerationConfig = GenerationModelConfig | GenerationServiceConfig;

type GenerationConfigToInput = {
  generationConfigId: number;
  generationInputId: number;
};

type GenerationInput = {
  id: number;
  name: string;
  data: GeneratorInputProps;
};

const group1: GenerationConfigGroup = {
  id: 1,
  type: 'image',
  name: 'Text to Image',
  baseModel: 'SD1',
  // modelId: 618692
};

const config1: GenerationConfig = {
  id: 1,
  groupId: 1,
  category: 'model',
  name: 'Standard',
  fields: [
    { type: 'resource-select', name: 'resources', label: 'Additional Resources', multiple: true },
    {
      type: 'textarea',
      name: 'prompt',
      label: 'Prompt',
      placeholder: 'Your prompt goes here...',
      required: true,
      info: `Type out what you'd like to generate in the prompt, add aspects you'd like to avoid in the negative prompt`,
    },
    {
      type: 'textarea',
      name: 'negativePrompt',
      label: 'Negative Prompt',
      placeholder: 'Your negative prompt goes here...',
    },
    {
      type: 'aspect-ratio',
      name: 'aspectRatio',
      label: 'Aspect Ratio',
      options: [
        { label: 'Square', width: 512, height: 512 },
        { label: 'Landscape', width: 768, height: 512 },
        { label: 'Portrait', width: 512, height: 768 },
      ],
    },
  ],
};

// #region [resource selectors]

// #endregion
