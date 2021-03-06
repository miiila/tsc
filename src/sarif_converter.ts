import { IAnalysisResult, ISuggestion, IFileSuggestion } from './interfaces/analysis-result.interface';
import { Log, ReportingConfiguration, ReportingDescriptor  } from "sarif"

interface ISarifSuggestion extends IFileSuggestion {
  id: string;
  ruleIndex: number;
  rule: ReportingDescriptor 
  level: ReportingConfiguration.level;
  text: string;
  file: string;
}
interface ISarifSuggestions {
  [suggestionIndex: number]: ISarifSuggestion;
}

export const getSarif = (analysisResults: IAnalysisResult): Log => {
  const {tool, suggestions}= getTools(analysisResults, getSuggestions(analysisResults))
  const results = getResults(suggestions)
  return { 
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json", 
    version: "2.1.0" ,
    runs:[
      {
        tool,
        results
      }
    ] 
  };
}

const getSuggestions= (analysisResults: IAnalysisResult)=> {
  const suggestions = {}
  for (const [file] of Object.entries(analysisResults.files)) {
    for (const [issueId, issue] of <[string, IFileSuggestion][]>Object.entries(analysisResults.files[file])) {
      if (!suggestions || !Object.keys(suggestions).includes(issueId)) {
        suggestions[issueId] = { ...issue[0], file: file.substring(1) };
      }
    }
  }
  return suggestions
}

const getTools = (analysisResults: IAnalysisResult, suggestions: ISarifSuggestions) => {
  const output = { driver: { name: 'DeepCode', semanticVersion: "1.0.0", } };
  const rules = [];
  let ruleIndex = 0
  for (const [suggestionName, suggestion] of <[string, ISuggestion][]>(
    Object.entries(analysisResults.suggestions)
  )) {
    let severity
    const severityNum: number = suggestion.severity
    if (severityNum > 0 && severityNum <= 3){
      severity = {
        3: 'error',
        2: 'warning',
        1: 'note',
      }[severityNum];
    }

    const suggestionId = suggestion.id;
    const rule ={
      id: suggestionId,
      name: suggestion.rule,
      shortDescription: {
        text: suggestion.message,
      },
      fullDescription: {
        text: suggestion.message,
      },
      defaultConfiguration: {
        level: severity,
      },
      help: {
        text: suggestion.message
      },
      properties: {
        tags: [suggestionId.split('%2F')[0]],
        precision: 'very-high',
      },
    }
    rules.push(rule);

    suggestions[suggestionName] = { ...suggestions[ suggestionName ], ruleIndex, rule, level: severity, id: suggestionId, text: suggestion.message };
    ruleIndex ++;
  }
  return {tool: { driver: { ...output.driver, rules } }, suggestions};
}

const getResults = (suggestions: ISarifSuggestions) => {
  const output = [];

  for (const [, suggestion] of <[string, ISarifSuggestion][]>Object.entries(suggestions)) {
    const result = {
      ruleId: suggestion.id,
      ruleIndex: suggestion.ruleIndex,
      level: suggestion.level ? suggestion.level : "none",
      message: {
        text: suggestion.text,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: suggestion.file,
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: suggestion.rows[0],
              endLine: suggestion.rows[1],
              startColumn: suggestion.cols[0],
              endColumn: suggestion.cols[1],
            },
          },
        },
      ],
    };

    const codeThreadFlows = [];
    // let i = 0;
    if (suggestion.markers && suggestion.markers.length >= 1) {
      for (const marker of suggestion.markers) {
        for (const position of marker.pos) {
          codeThreadFlows.push({
            location: {
              physicalLocation: {
                artifactLocation: {
                  uri: suggestion.file,
                  uriBaseId: '%SRCROOT%',
                  // index: i,
                },
                region: {
                  startLine: position.rows[0],
                  endLine: position.rows[1],
                  startColumn: position.cols[0],
                  endColumn: position.cols[1],
                },
              },
            },
          });
          // i += 1;
        }
      }
    } else {
      codeThreadFlows.push({
        location: {
          physicalLocation: {
            artifactLocation: {
              uri: suggestion.file,
              uriBaseId: '%SRCROOT%',
              // index: i,
            },
            region: {
              startLine: suggestion.rows[0],
              endLine: suggestion.rows[1],
              startColumn: suggestion.cols[0],
              endColumn: suggestion.cols[1],
            },
          },
        },
      });
    }
    const newResult = {
      ...result,
      codeFlows: [
        {
          threadFlows: [
            {
              locations: codeThreadFlows,
            },
          ],
        },
      ],
    };
    output.push(newResult);
  }
  return output;
}
